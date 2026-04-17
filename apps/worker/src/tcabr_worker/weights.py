import json
from pathlib import Path
from typing import Literal, TypedDict

FeatureId = Literal[
    "new_account",
    "no_recent_commits",
    "zero_social",
    "sparse_profile",
    "star_farmer",
    "bot_username",
    "star_burst",
]


class FeatureWeight(TypedDict):
    id: FeatureId
    weight: int
    description: str


class Normalization(TypedDict):
    max_raw: int
    scale: int


class FeatureWeightsConfig(TypedDict):
    version: int
    updated_at: str
    normalization: Normalization
    features: list[FeatureWeight]


_JSON_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "shared"
    / "src"
    / "feature-weights.json"
)


def load_weights() -> FeatureWeightsConfig:
    with _JSON_PATH.open("r") as f:
        return json.load(f)


WEIGHTS: FeatureWeightsConfig = load_weights()
