# computer-use

Explorations with Anthropic's computer use docker image and making it more tool and browser-automation friendly.

## Running Anthropic's base image

```zsh
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

1. Write a separate MCP server that runs outside the docker image that does a lot of `docker exec` commands into the anthropic CU image.
2. Embed an MCP server into the docker image. Tricky because MCP servers are typically exposed via program stdin/stdout.

Let's do approach #2 since I think it won't be too hard, and it can borrow from the anthropic published tool implementations.

- `./src/server.ts` contains an MCP server that ports the three Anthropic-defined computer use tools to typescript, as described in [how to implement computer use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use#how-to-implement-computer-use).
- `./Dockerfile` modifies the Anthropic computer use docker image to install this MCP server and run it.

If you run

```bash
docker build -t computer-use .
```

And then edit Claude Desktop's config to have something like this:

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--name",
        "computer-use-mcp-server",
        "-p",
        "5900:5900",
        "-p",
        "8501:8501",
        "-p",
        "6080:6080",
        "-p",
        "8080:8080",
        "-p",
        "9222:9222",
        "computer-use"
      ]
    }
  }
}
```

Then you should be able to do computer use from Claude Desktop!

You can open up [http://localhost:6080/vnc.html](http://localhost:6080/vnc.html) to follow along with what it's doing. Claude doesn't clean up the docker container after closing Claude desktop so you will need to `docker kill computer-user-mcp-server`.

# Make it speak Playwright

Anthropic's CU image uses Firefox, which unfortunately is hard to get working with Playwright ([Playwright requires a patched version of firefox](https://stackoverflow.com/questions/75090385/running-playwright-with-the-local-firefox)).

So we can try Chromium, which can be used by Playwright over CDP. The Dockerfile installs this as well and launches it on startup.
We also run a proxy in the Docker image (`./src/proxy/proxy.ts`) that logs incoming requests and responses.

Running the image locally now with the additional `9222` CDP/Webdriver Bidi port exposed:

```zsh
docker run --rm -i -p 5900:5900 -p 8501:8501 -p 6080:6080 -p 8080:8080 -p 9222:9222 --name computer-use-mcp-server computer-use
```

And then try running a test playwright script against it (while also peeking at the web VNC viewer):

```
$ tsx src/scripts/playwright.ts
Connected to chromium
Navigated to news.ycombinator.com
Screenshot saved to playwright-screenshot.png
Connection closed
```

Woo!
