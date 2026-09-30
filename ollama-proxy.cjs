const http = require("http");

const server = http.createServer((req, res) => {
    const proxy = http.request(
        {
            hostname: "127.0.0.1",
            port: 11434,
            path: req.url,
            method: req.method,
            headers: {
                ...req.headers,
                host: "localhost:11434",
            },
        },
        (upstream) => {
            res.writeHead(
                upstream.statusCode ?? 502,
                upstream.headers,
            );

            upstream.pipe(res);
        },
    );

    proxy.on("error", (error) => {
        res.writeHead(502, {
            "Content-Type": "text/plain",
        });

        res.end(`Proxy error: ${error.message}`);
    });

    req.pipe(proxy);
});

server.listen(11435, "127.0.0.1", () => {
    console.log(
        "Ollama proxy: http://127.0.0.1:11435 -> http://127.0.0.1:11434",
    );
});