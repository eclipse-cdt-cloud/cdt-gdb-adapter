const net = require('net');
const os = require('os');

// Create socket echo server.
const socketServer = new net.Server();

socketServer.on('connection', (connection) => {
    console.log('adapter connected');

    connection.on('end', () => {
        console.log('adapter disconected');
    });

    // Echo "Hello World!"
    connection.write(`Hello World!${os.EOL}`);
});

socketServer.on('close', () => {
    console.log('shutting down');
});

socketServer.on('error', (error) => {
    throw error;
});

function serverListen() {
    socketServer.listen(0, 'localhost', 1, () => {
        const port = socketServer.address().port;
        console.log(`${port}`);
    });
}

serverListen();
