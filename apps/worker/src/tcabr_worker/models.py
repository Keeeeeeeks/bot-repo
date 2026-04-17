from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    owner: str
    name: str
    user_token: str | None = None

    @property
    def repo_slug(self) -> str:
        return f"{self.owner}/{self.name}"


class RepoMeta(BaseModel):
    owner: str
    name: str
    star_count: int
    default_branch: str


class StargazerEvent(BaseModel):
    username: str
    starred_at: datetime


class UserProfile(BaseModel):
    username: str
    joined_at: datetime
    followers: int = 0
    following: int = 0
    public_repos: int = 0
    recent_commits_60d: int = 0
    bio: str | None = None
    avatar_is_default: bool = False
    starred_repos_count: int = 0
    raw: dict = Field(default_factory=dict)


class BurstWindow(BaseModel):
    start: datetime
    end: datetime
    z_score: float
