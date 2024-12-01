const http = require("node:http");
const { proParse } = require("../dist/index.js");

const server = http.createServer((req, res) => {
  proParse(req).then((data) => {
    console.log(data);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        data: "Hello world",
      })
    );
  });
});

server.listen(8080);
