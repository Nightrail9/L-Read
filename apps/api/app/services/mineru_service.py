import shutil
import subprocess
import time
import zipfile
from pathlib import Path

import requests
from requests import RequestException
from requests.exceptions import SSLError


class MinerUError(RuntimeError):
    pass


class MinerUService:
    BASE_URL = "https://mineru.net/api/v4"
    DOWNLOAD_USER_AGENT = "lread-mineru-client/1.0"

    def __init__(self, token: str, verify_ssl: bool = True, download_retries: int = 3):
        self.token = token
        self.verify_ssl = verify_ssl
        self.download_retries = max(1, download_retries)
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

    def submit_pdf(self, pdf_path: Path) -> str:
        url = f"{self.BASE_URL}/file-urls/batch"
        print(f"[MinerU] 提交文献: {pdf_path.name}")
        payload = {
            "enable_formula": True,
            "enable_table": True,
            "enable_ocr": False,
            "language": "auto",
            "files": [{"name": pdf_path.name}],
        }
        resp = requests.post(
            url,
            headers=self.headers,
            json=payload,
            timeout=30,
            verify=self.verify_ssl,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise MinerUError(data.get("msg", "failed to get upload URL"))

        batch_id = data["data"]["batch_id"]
        upload_url = data["data"]["file_urls"][0]

        with pdf_path.open("rb") as f:
            file_data = f.read()
        put_resp = requests.put(
            upload_url,
            data=file_data,
            timeout=300,
            verify=self.verify_ssl,
        )
        if put_resp.status_code not in {200, 201}:
            raise MinerUError(f"upload failed: HTTP {put_resp.status_code}")
        print(f"[MinerU] 上传完成，batch_id={batch_id}")
        return batch_id

    def wait_done(
        self, batch_id: str, timeout_sec: int = 600, interval_sec: int = 5
    ) -> dict:
        deadline = time.time() + timeout_sec
        url = f"{self.BASE_URL}/extract-results/batch/{batch_id}"
        print(f"[MinerU] 轮询解析状态: batch_id={batch_id}")

        while time.time() < deadline:
            resp = requests.get(
                url,
                headers=self.headers,
                timeout=30,
                verify=self.verify_ssl,
            )
            data = resp.json()
            if data.get("code") != 0:
                raise MinerUError(data.get("msg", "query failed"))
            results = data.get("data", {}).get("extract_result", [])
            if results:
                info = results[0]
                state = info.get("state")
                print(f"[MinerU] 当前状态: {state}")
                if state == "done":
                    print("[MinerU] 解析完成")
                    return info
                if state == "failed":
                    raise MinerUError(info.get("err_msg", "parse failed"))
            time.sleep(interval_sec)
        raise MinerUError("timeout waiting result")

    def _download_with_requests(
        self, zip_url: str, zip_path: Path, *, verify_ssl: bool, retries: int
    ) -> Exception | None:
        last_error: Exception | None = None
        headers = {"User-Agent": self.DOWNLOAD_USER_AGENT}
        for attempt in range(1, retries + 1):
            try:
                with requests.get(
                    zip_url,
                    timeout=(30, 300),
                    stream=True,
                    verify=verify_ssl,
                    headers=headers,
                ) as resp:
                    resp.raise_for_status()
                    with zip_path.open("wb") as f:
                        for chunk in resp.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)
                if not zip_path.exists() or zip_path.stat().st_size == 0:
                    last_error = MinerUError("downloaded zip is empty")
                else:
                    return None
            except (SSLError, RequestException) as exc:
                last_error = exc

            if attempt < retries:
                time.sleep(min(2 * attempt, 6))
        return last_error

    def download_and_prepare(
        self, file_info: dict, out_dir: Path, pdf_stem: str
    ) -> dict:
        out_dir.mkdir(parents=True, exist_ok=True)
        zip_url = file_info.get("full_zip_url")
        if not zip_url:
            raise MinerUError("missing full_zip_url")

        tmp_dir = out_dir / "_tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        zip_path = tmp_dir / "result.zip"

        print("[MinerU] 开始下载解析结果压缩包")
        last_error = self._download_with_requests(
            zip_url,
            zip_path,
            verify_ssl=self.verify_ssl,
            retries=self.download_retries,
        )

        used_insecure_fallback = False
        if last_error and isinstance(last_error, SSLError) and self.verify_ssl:
            used_insecure_fallback = True
            print("[MinerU] 检测到 SSL/TLS 握手异常，尝试关闭证书校验重试下载")
            last_error = self._download_with_requests(
                zip_url,
                zip_path,
                verify_ssl=False,
                retries=max(1, min(2, self.download_retries)),
            )

        if last_error:
            print("[MinerU] requests 下载失败，尝试 curl 兜底下载")
            curl_error = self._download_with_curl(
                zip_url,
                zip_path,
                insecure=(not self.verify_ssl or used_insecure_fallback),
            )
            if curl_error:
                raise MinerUError(
                    "下载结果压缩包失败。"
                    f"requests 重试 {self.download_retries} 次后仍失败，"
                    f"curl 兜底也失败：{curl_error}"
                ) from last_error
            print("[MinerU] curl 兜底下载成功")
        else:
            print("[MinerU] requests 下载成功")

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        image_dir = next((p for p in tmp_dir.rglob("images") if p.is_dir()), None)
        md_files = list(tmp_dir.rglob("*.md"))
        if not image_dir or not md_files:
            raise MinerUError("cannot find images or markdown")

        chosen_md = max(md_files, key=lambda p: p.stat().st_size)
        final_images = out_dir / "assets" / "images"
        final_images.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(image_dir, final_images, dirs_exist_ok=True)

        final_md = out_dir / "paper.md"
        final_md.write_text(
            chosen_md.read_text(encoding="utf-8", errors="replace"), encoding="utf-8"
        )

        shutil.rmtree(tmp_dir, ignore_errors=True)
        return {
            "markdown_path": str(final_md),
            "images_dir": str(final_images),
            "image_count": len([p for p in final_images.glob("*") if p.is_file()]),
            "pdf_stem": pdf_stem,
        }

    def _download_with_curl(
        self, zip_url: str, zip_path: Path, *, insecure: bool = False
    ) -> str | None:
        command = [
            "curl",
            "-L",
            "--fail",
            "--retry",
            str(self.download_retries),
            "--retry-delay",
            "2",
            "--connect-timeout",
            "30",
            "--max-time",
            "600",
            "-o",
            str(zip_path),
            zip_url,
        ]
        if insecure:
            command.insert(1, "-k")

        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
            )
            if not zip_path.exists() or zip_path.stat().st_size == 0:
                return "curl succeeded but output zip is empty"
            return None
        except FileNotFoundError:
            return "curl executable not found"
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            detail = stderr or stdout or f"exit code {exc.returncode}"
            return f"curl failed: {detail}"

    def extract_pdf(self, pdf_path: Path, output_dir: Path) -> dict:
        batch_id = self.submit_pdf(pdf_path)
        info = self.wait_done(batch_id)
        return self.download_and_prepare(info, output_dir, pdf_path.stem)
