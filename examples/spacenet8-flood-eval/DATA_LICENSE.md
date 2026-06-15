# Data license and attribution

This example uses a configurable sample from the **SpaceNet 8 Flood Detection Challenge** training
dataset, up to all pairs listed in the official Germany and Louisiana-East mapping files. All source
URLs are under the official `spacenet/SN8_floods/` prefix, which the SpaceNet bucket licenses under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

- Official license notice: <https://spacenet-dataset.s3.amazonaws.com/LICENSE.md>
- Dataset files: <https://spacenet-dataset.s3.amazonaws.com/?list-type=2&prefix=spacenet/SN8_floods/>
- Challenge overview: <https://spacenet.ai/sn8-challenge/>

## Attribution and changes

Attribution: SpaceNet 8 Flood Detection Challenge dataset and its contributors.

This example:

- selects the requested mapped pairs from the Germany and Louisiana-East public training
  collections, including optional second post-event images when building the complete dataset;
- records the official pre-event image, post-event image, and GeoJSON label URL and SHA-256 for
  each tile in the generated `dataset.json`;
- computes coarse flooded-building and flooded-road count ranges from the GeoJSON labels; and
- resizes the source GeoTIFFs to deterministic 640 x 640 JPEG quicklooks during local setup.

The downloaded source data, generated quicklooks, and dataset-derived manifest are subject to
CC BY-SA 4.0. Preserve attribution, indicate changes, link the license, and use compatible
ShareAlike terms when redistributing them. Raw source files and generated JPEGs are gitignored.

Suggested citation:

> Hänsch, R., Arndt, J., Lunga, D., Gibb, M., Pedelose, T., Boedihardjo, A., Petrie, D., and
> Bacastow, T. M. “SpaceNet 8 - The Detection of Flooded Roads and Buildings.” CVPR Workshops,
> 2022, pp. 1472-1480.

## Software license

The [SpaceNet8 source-code repository](https://github.com/SpaceNetChallenge/SpaceNet8) is
Apache-2.0. That software license does not replace the dataset license. The Promptfoo
configuration and scripts in this example use the Promptfoo repository's software license.
