FROM ghcr.io/actions/actions-runner:2.321.0

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

# Install Go (stable, used by actionlint and shfmt)
ENV GO_VERSION=1.23.6
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz
ENV PATH="${PATH}:/usr/local/go/bin"

# Install actionlint for workflow validation
RUN curl -sL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash && \
    mv actionlint /usr/local/bin/

# Install shfmt for shell formatting
RUN GOPATH=/tmp/go go install mvdan.cc/sh/v3/cmd/shfmt@latest && \
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
