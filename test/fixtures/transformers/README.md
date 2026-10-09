# Local Transformers fixture

`tiny-bert` is a self-generated ONNX model and seven-token WordPiece tokenizer for
package artifact tests. It contains no downloaded model weights and makes no network
requests. It is intentionally not a language model.

The ONNX graph (IR 8, opset 13) accepts BERT's three int64 inputs with shape
`[batch, sequence]`. It casts `input_ids` to float32 and unsqueezes the last axis
using an int64 initializer `axes = [-1]`, returning `last_hidden_state` with shape
`[batch, sequence, 1]`. The other inputs are unused.

`hello world` tokenizes to `[2, 4, 5, 3]` including special tokens. Mean pooling
without normalization therefore returns `[3.5]`. This checks the real tokenizer,
CPU ONNX runtime, and Promptfoo embedding adapter together without model downloads.
