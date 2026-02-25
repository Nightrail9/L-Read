from typing import Literal

from pydantic import BaseModel, Field


class RepoPayload(BaseModel):
    type: str = Field(pattern="^(git|local_path)$")
    git_url: str | None = None
    branch: str | None = None
    path: str | None = None
    force_confirm: bool = False


class SelectionsPayload(BaseModel):
    architecture_image: str | None = None
    formula_images: list[str] = []
    focus_files: list[str] = []


class LLMConfigPayload(BaseModel):
    provider: str = Field(pattern="^(gpt|gemini|openai-compatible)$")
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


class RunModulesPayload(BaseModel):
    mode: Literal["all", "retry_failed", "single"] = "retry_failed"
    module: str | None = Field(
        default=None,
        pattern="^(module_02|module_03|module_04|module_05)$",
    )


class UpdateOutputPayload(BaseModel):
    content: str = ""
