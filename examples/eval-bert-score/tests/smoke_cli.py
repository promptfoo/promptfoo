"""Run both example configs with a tiny local model and the real BERTScore scorer."""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

import torch
import yaml
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.processors import TemplateProcessing
from transformers import PreTrainedTokenizerFast, RobertaConfig, RobertaModel

EXAMPLE = Path(__file__).resolve().parents[1]
REPO = EXAMPLE.parents[1]


@contextmanager
def local_model_alias(model_path):
    # BERTScore treats any model name containing "t5" as T5, even a local path.
    alias = REPO / f".promptfoo-bertscore-model-{uuid.uuid4().hex}"
    alias.symlink_to(model_path, target_is_directory=True)
    try:
        yield f"./{alias.name}"
    finally:
        alias.unlink()


def run_cli(config, output, env):
    command = [
        "npm",
        "run",
        "local",
        "--",
        "eval",
        "-c",
        str(config),
        "--no-cache",
        "--no-write",
        "--no-share",
        "-o",
        str(output),
    ]
    with subprocess.Popen(
        command, cwd=REPO, env=env, start_new_session=True
    ) as process:
        try:
            returncode = process.wait(timeout=180)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            raise
        if returncode:
            raise subprocess.CalledProcessError(returncode, command)


def main():
    configs = [
        yaml.safe_load((EXAMPLE / name).read_text())
        for name in ("promptfooconfig.yaml", "promptfooconfig-advanced.yaml")
    ]
    references = []
    for config in configs:
        for test in config["tests"]:
            reference = test["vars"]["reference"]
            references.extend(reference if isinstance(reference, list) else [reference])

    # Force the physical path to contain "t5" so removing the safe alias regresses.
    with (
        tempfile.TemporaryDirectory(
            prefix="promptfoo-bertscore-smoke-t5-"
        ) as directory,
        local_model_alias(Path(directory) / "model") as model_type,
    ):
        root = Path(directory)
        model_path = root / "model"
        vocabulary = ["<s>", "<pad>", "</s>", "<unk>"]
        vocabulary.extend(sorted(set(re.findall(r"\w+|[^\w\s]", " ".join(references)))))
        tokenizer = Tokenizer(
            WordLevel({word: i for i, word in enumerate(vocabulary)}, unk_token="<unk>")
        )
        tokenizer.pre_tokenizer = Whitespace()
        tokenizer.post_processor = TemplateProcessing(
            single="<s> $A </s>", special_tokens=[("<s>", 0), ("</s>", 2)]
        )
        PreTrainedTokenizerFast(
            tokenizer_object=tokenizer,
            bos_token="<s>",
            eos_token="</s>",
            unk_token="<unk>",
            pad_token="<pad>",
            model_max_length=128,
        ).save_pretrained(model_path)
        torch.manual_seed(0)
        RobertaModel(
            RobertaConfig(
                vocab_size=len(vocabulary),
                hidden_size=16,
                num_hidden_layers=2,
                num_attention_heads=2,
                intermediate_size=32,
                max_position_embeddings=130,
            )
        ).save_pretrained(model_path)
        shutil.copyfile(EXAMPLE / "bertscore_check.py", root / "bertscore_check.py")
        env = {
            key: value
            for key, value in os.environ.items()
            if not key.lower().endswith("_proxy")
        }
        env.update(
            PROMPTFOO_PYTHON=sys.executable,
            PROMPTFOO_CONFIG_DIR=str(root / "promptfoo"),
            PROMPTFOO_DISABLE_TELEMETRY="1",
            PROMPTFOO_DISABLE_SHARING="1",
            HF_HUB_OFFLINE="1",
            TRANSFORMERS_OFFLINE="1",
            HF_HUB_DISABLE_TELEMETRY="1",
            CUDA_VISIBLE_DEVICES="",
            MPLCONFIGDIR=str(root / "matplotlib"),
        )
        for index, config in enumerate(configs):
            # Keep the original tests, references, assertion wiring and expansion options.
            # Only model inputs/providers change so the smoke needs no external API.
            config["providers"] = ["echo"]
            config["prompts"] = ["{{smokeOutput}}"]
            for test in config["tests"]:
                variables = test["vars"]
                reference = variables["reference"]
                variables.update(
                    bertScoreModel=model_type,
                    bertScoreLayers=2,
                    smokeOutput=reference[-1]
                    if isinstance(reference, list)
                    else reference,
                )
            config_path = root / f"config-{index}.json"
            config_path.write_text(json.dumps(config))
            output_path = root / f"results-{index}.json"
            run_cli(config_path, output_path, env)
            results = json.loads(output_path.read_text())["results"]["results"]
            if len(results) != len(config["tests"]):
                raise AssertionError(
                    "Reference arrays expanded into extra evaluation cases"
                )
            for result in results:
                expected = config["tests"][result["testIdx"]]["vars"]
                if result["vars"]["reference"] != expected["reference"]:
                    raise AssertionError(
                        "Reference values changed during config evaluation"
                    )
                if (
                    not result["success"]
                    or abs(result["score"] - 1) > 1e-5
                    or result.get("error")
                    or result["response"].get("error")
                ):
                    raise AssertionError(f"Real BERTScore assertion failed: {result}")
                if result["response"].get("output") != expected["smokeOutput"]:
                    raise AssertionError("Unexpected provider output")
        print(
            "Real CPU BERTScore CLI smoke passed: 2 basic cases and 1 multi-reference case; no model downloads."
        )


if __name__ == "__main__":
    main()
