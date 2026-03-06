#!/bin/bash -e

# Download some PDFs from arxiv.org
mkdir -p pdfs
curl -L -o pdfs/arxiv_1.pdf https://arxiv.org/pdf/2409.00001.pdf
curl -L -o pdfs/arxiv_2.pdf https://arxiv.org/pdf/2409.00002.pdf
curl -L -o pdfs/arxiv_3.pdf https://arxiv.org/pdf/2409.00003.pdf
