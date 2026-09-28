from __future__ import annotations

import numpy
import onnx
import torch


def main() -> None:
    print(f"numpy {numpy.__version__}")
    print(f"onnx {onnx.__version__}")
    print(f"torch {torch.__version__}")


if __name__ == "__main__":
    main()
