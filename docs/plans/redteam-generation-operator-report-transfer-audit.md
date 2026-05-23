# Operator Report Transfer Audit

| Plugin     | Available axes                                                | Missing axes                                  | Reusable sections                                            | Transfer status |
| ---------- | ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | --------------- |
| pii:social | leak-ready proxy, target-regime breadth, realized target yield | -                                             | executive summary, frontier, per-regime evidence, known limitations | ready |
| pii:direct | semantic sensitive-field frontier                             | target-regime breadth, realized target yield   | executive summary, frontier, known limitations                | blocked |

## Reading

The `pii:social` operator report does not transfer whole-cloth to `pii:direct`
yet. That is not because direct PII lacks a usable semantic frontier; it already
has a strong one-band sensitive-field frontier. The missing pieces are the two
evaluation axes that made the social report operator-facing:

1. multiple target regimes
2. realized yield across those regimes

The reusable design is therefore narrower than the concrete social report:

- report sections can generalize
- benchmark axes cannot be assumed
- per-regime evidence should only appear once a plugin has target replay assets
