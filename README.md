# computer-use

Explorations with Anthropic's computer use docker image and making it more tool-friendly.

## Running Anthropic's image

```
export ANTHROPIC_API_KEY=%your_api_key%
docker run \
    -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
    -v $HOME/.anthropic:/home/computeruse/.anthropic \
    -p 5900:5900 \
    -p 8501:8501 \
    -p 6080:6080 \
    -p 8080:8080 \
    -it ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest
```

The different ports exposed:

- 5900 is the raw VNC port
- NoVNC is set up to connect to it and then exposes a web UI VNC client for clicking around: http://localhost:6080/vnc.html
- Streamlit for the prompt interface: http://localhost:8501/
- Web app that iframes the NoVNC client and the Streamlit interfaces into one web page: http://localhost:8080/

# Make it speak MCP

There are different approaches that could be taken:

1. Write a separate MCP server that runs outside the docker image that proxies `docker exec` commands into the anthropic CU image.
2. Embed and expose an MCP server into the docker image. Tricky because MCP servers are exposed via program stdin/stdout.

Let's do approach #2 since I think it won't be too hard, and it can borrow from the anthropic published tool implementations.
