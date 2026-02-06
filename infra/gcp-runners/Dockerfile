FROM ghcr.io/actions/actions-runner:2.328.0

USER root

# Install system dependencies needed for building language runtimes
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    jq \
    unzip \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libffi-dev \
    liblzma-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libyaml-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Go (pinned version with checksum verification)
ENV GO_VERSION=1.23.6
ENV GO_SHA256=9379441ea310de000f33a4dc767bd966e72ab2826270e038e78b2c53c2e7802d
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz && \
    echo "${GO_SHA256}  go${GO_VERSION}.linux-amd64.tar.gz" | sha256sum -c - && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz
ENV PATH="${PATH}:/usr/local/go/bin"

# Install actionlint for workflow validation (pinned version)
ENV ACTIONLINT_VERSION=1.7.7
RUN curl -sLO "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" && \
    tar -xzf "actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" actionlint && \
    mv actionlint /usr/local/bin/ && \
    rm "actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"

# Install shfmt for shell formatting (pinned version)
ENV SHFMT_VERSION=v3.10.0
RUN GOPATH=/tmp/go go install "mvdan.cc/sh/v3/cmd/shfmt@${SHFMT_VERSION}" && \
    mv /tmp/go/bin/shfmt /usr/local/bin/ && \
    rm -rf /tmp/go

# Create tool cache directory for actions/setup-* to use
RUN mkdir -p /opt/hostedtoolcache && \
    chown -R runner:runner /opt/hostedtoolcache

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

USER runner

# Set tool cache location (used by setup-node, setup-python, setup-ruby)
ENV RUNNER_TOOL_CACHE=/opt/hostedtoolcache

ENTRYPOINT ["/start.sh"]
