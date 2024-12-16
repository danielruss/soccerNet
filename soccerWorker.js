import SOCcer from './soccer3.mjs'
import parse_file from "./io.js"

let callbacks = {
    chunk_complete: (row, total) =>
        postMessage({ type: "update", completed: row, total: total }),
    file_complete: (outputFileHandle, metadata) => {
        console.log(outputFileHandle)
        postMessage({ type: "parse_complete", fileHandle: outputFileHandle, metadata: metadata })
    },
    onerror: (message) =>
        postMessage({ type: "error", message: message }),
}

self.onmessage = async function (e) {
    console.log(`WORKER: received message `, e.data)
    switch (e.data?.type) {
        case "code_file":
            let soccerNet = new SOCcer(e.data.version)
            await soccerNet.wait_until_ready();
            let file = e.data.file
            let n = e.data.n
            parse_file(file, soccerNet, n, callbacks)
            break;
        default:
            postMessage({ type: "error", message: `unknown message type ${e.data?.type}` });
    }
}
