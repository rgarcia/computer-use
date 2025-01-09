FROM ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest

# Switch to computeruse user and install bun
USER computeruse
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.43"
ENV PATH="/home/computeruse/.bun/bin:$PATH"

# Create mcp-server directory
RUN mkdir -p /home/computeruse/mcp-server

# Copy MCP server code
COPY --chown=computeruse:computeruse . /home/computeruse/mcp-server
WORKDIR /home/computeruse/mcp-server

# Install dependencies
RUN bun install

# Modify entrypoint script
COPY --chmod=0755 <<'EOL' /home/computeruse/entrypoint.sh
#!/bin/bash
set -e

# riff on the anthropic entrypoint script that runs the MCP server
# the MCP server transport is stdout/stdin, so we need to pipe all other logs to files

./start_all.sh > /tmp/start_all_logs.txt 2>&1
./novnc_startup.sh > /tmp/novnc_logs.txt 2>&1

python http_server.py > /tmp/server_logs.txt 2>&1 &

STREAMLIT_SERVER_PORT=8501 python -m streamlit run computer_use_demo/streamlit.py > /tmp/streamlit_stdout.log 2>&1 &

cd /home/computeruse/mcp-server && bun run src/server.ts
EOL

WORKDIR /home/computeruse
ENTRYPOINT ["./entrypoint.sh"]