FROM ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest

USER root
RUN add-apt-repository -y ppa:xtradeb/apps
RUN apt update -y && apt install -y chromium

# Switch to computeruse user and install bun
USER computeruse
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.43"
ENV PATH="/home/computeruse/.bun/bin:$PATH"


# Copy our code
RUN mkdir -p /home/computeruse/computer-use
COPY --chown=computeruse:computeruse . /home/computeruse/computer-use
WORKDIR /home/computeruse/computer-use

# Install dependencies
RUN bun install

# Modify entrypoint script
COPY --chmod=0755 <<'EOL' /home/computeruse/entrypoint.sh
#!/bin/bash
set -e

# riff on the anthropic entrypoint script that runs the MCP server
# the MCP server transport is stdout/stdin, so we need to pipe all other logs to files

./start_all.sh >&2

# Start Chromium with display :1 and remote debugging
DISPLAY=:1 chromium \
  --remote-debugging-port=9221 \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-software-rasterizer \
  --remote-allow-origins=* \
  --no-zygote &

./novnc_startup.sh >&2

python http_server.py >&2 &

STREAMLIT_SERVER_PORT=8501 python -m streamlit run computer_use_demo/streamlit.py >&2 &

# the CDP/BiDi proxy
cd /home/computeruse/computer-use && LISTEN_PORT=9222 FORWARD_PORT=9221 bun run src/proxy/proxy.ts

# the mcp server
cd /home/computeruse/computer-use && bun run src/server.ts

EOL

WORKDIR /home/computeruse
ENTRYPOINT ["./entrypoint.sh"]