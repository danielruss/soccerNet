import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm'
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"
import { soc2010, SOCcer3 } from './soccer3_onnx.mjs';

self.onmessage = async function (e) {
    switch (e.data?.type) {
        case "code_file":
            let soccerNet = new SOCcer3(e.data.version)
            await soccerNet.wait_until_ready();
            let file = e.data.file
            parseFile(file, soccerNet, e.data.n)
            break;
        default:
            postMessage({ type: "error", message: `unknown message type ${e.data?.type}` });
    }
}

async function parseFile(file, soccerNet, n) {
    console.log(file.type)
    switch (file.type) {
        case "text/csv":
            parseCSV(file, soccerNet, n)
            break;
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            parseXLSX(file, soccerNet, n)
            break;
        default:
            postMessage({ type: "error", message: `cannot handle file type ${file.type}` });
    }
}

async function countChunks(file) {
    return new Promise((resolve, reject) => {
        let lines = 0
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            step: (results) => { lines = lines + 1 },
            complete: () => resolve(lines)
        })
    })
}

// convert from array of objects to object of arrays...
function rowsToColumms(array) {
    return array.reduce((acc, cur) => {
        let o = Object.keys(cur).forEach(k => {
            if (!Array.isArray(acc[k])) {
                acc[k] = [];
            }
            acc[k].push(cur[k])
        })
        return acc
    }, {})
}
async function soccer_chunk(papa_results, soccerNet, n) {

    let o = rowsToColumms(papa_results)
    let Id = o.Id
    let JobTitle = o.JobTitle
    let JobTask = o.JobTask
    delete o.Id
    delete o.JobTitle
    delete o.JobTask

    let res = await soccerNet.code_jobs(Id, JobTitle, JobTask, o, n)
    return res
}

// use a 4K chunksize
const papa_parse_chunkSize = 4 * 1024;
async function parseCSV(file, soccerNet, n) {
    let cnt = await countChunks(file)
    let row = 0;
    let metadata = {
        soccerVersion: soccerNet.version,
        inputFilename: file.name,
        startTime: new Date(),
    }

    const outputFileHandle = await getOPFSFileHandle(file)
    const writable = await outputFileHandle.createWritable();

    Papa.parse(file, {
        num_rows: cnt,
        header: true,
        skipEmptyLines: true,
        chunkSize: papa_parse_chunkSize,
        beforeFirstChunk: function () {
            postMessage({ type: "update", completed: row, total: this.num_rows });
        },
        chunk: async function (papa_results, parser) {
            parser.pause()
            let soccer_results = await soccer_chunk(papa_results.data, soccerNet, n)
            soccer_results.input = papa_results;
            await add_chunk_to_opfs(soccer_results, writable, row == 0);
            row += papa_results.data.length
            postMessage({ type: "update", completed: row, total: this.num_rows });
            parser.resume()
        },
        complete: async function (results, file) {
            await writable.close()
            metadata.endTime = new Date();
            postMessage({ type: "parse_complete", fileHandle: outputFileHandle, metadata: metadata });
        }
    })
}
async function parseXLSX(file, soccerNet, n) {
    const workbook = await XLSX.read(await file.arrayBuffer(), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    let metadata = {
        soccerVersion: soccerNet.version,
        inputFilename: file.name,
        startTime: new Date(),
    }

    const outputFileHandle = await getOPFSFileHandle(file)
    const writable = await outputFileHandle.createWritable();
    const chunkSize = 25;

    console.log(data)
    let fields = Object.keys(data[0])
    for (let row = 0; row < data.length; row += chunkSize) {
        let firstChunk = row == 0;
        let lastRow = Math.min(row + chunkSize, data.length)
        let chunk = data.slice(row, lastRow);
        //console.log(`chunk ${row} -> ${lastRow - 1}`)
        let soccer_results = await soccer_chunk(chunk, soccerNet, n)
        soccer_results.input = {
            data: chunk,
            meta: {
                fields: fields
            }
        }
        await add_chunk_to_opfs(soccer_results, writable, row == 0);
        postMessage({ type: "update", completed: lastRow, total: data.length });
    }


    postMessage({ type: "parse_complete", fileHandle: outputFileHandle, metadata: metadata });
}


function removeExtension(filename) {
    return filename.substring(0, filename.lastIndexOf('.')) || filename;
}
async function getOPFSFileHandle(file) {
    const root = await navigator.storage.getDirectory();
    let outputFilename = removeExtension(file.name) + "_soccer_output.csv"
    return root.getFileHandle(outputFilename, { create: true });
}

async function add_chunk_to_opfs(soccer_results, out, firstChunk) {
    let all_fields = soccer_results.input.meta.fields.map((x) => x);
    for (let i = 1; i <= soccer_results[0].soc2010.length; i++) {
        all_fields.push(`soc2010_${i}`, `title_${i}`, `score_${i}`)
    }
    // make and fill an object for papa parse...
    let data_to_write = {
        fields: all_fields,
        data: []
    }
    for (let i = 0; i < soccer_results.input.data.length; i++) {
        let obj = {}
        for (let field of soccer_results.input.meta.fields) {
            obj[field] = soccer_results.input.data[i][field]
        }
        for (let j = 0; j < soccer_results[0].soc2010.length; j++) {
            obj[`soc2010_${j + 1}`] = soccer_results[i].soc2010[j];
            obj[`title_${j + 1}`] = soccer_results[i].title[j];
            obj[`score_${j + 1}`] = soccer_results[i].score[j];
        }
        data_to_write.data.push(obj);
    }

    await out.write(Papa.unparse(data_to_write, { header: firstChunk }) + "\n");
}