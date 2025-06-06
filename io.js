import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm'
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"

Function.prototype.isFunction = (x) => typeof x === "function"

/*   This should be runnable from a worker...  
callbacks:
   chunk_complete: f(row,total),
   file_complete: f(outputFileHandle,metadata)
   onerror: f(message)
*/

export default async function parse_file(file, soccer, n, callbacks) {
    switch (file.type) {
        case "text/csv":
            await parseCSV(file, soccer, n, callbacks)
            break;
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            await parseXLSX(file, soccer, n, callbacks)
            break;
        default:
            callbacks.onerror(`cannot handle file type: ${file.type}`)
    }
}

async function countLines(file) {
    return new Promise((resolve, reject) => {
        let lines = {
            numberOfLines: 0,
            fields: []
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            step: (results) => {
                if (lines.numberOfLines == 0) lines.fields = results.meta.fields
                lines.numberOfLines = lines.numberOfLines + 1
            },
            complete: () => resolve(lines)
        })
    })
}


/*
STATUS:.... fixing writing out csv... write first line then others...
*/

// use a 4K chunksize
const papa_parse_chunkSize = 4 * 1024;
async function parseCSV(file, soccer, n, callbacks) {
    let { numberOfLines, fields } = await countLines(file)

    let row = 0;
    let metadata = {
        soccerVersion: soccer.version.version,
        inputFilename: file.name,
        startTime: new Date(),
    }

    const outputFileHandle = await getOPFSFileHandle(file)
    const writable = await outputFileHandle.createWritable();

    Papa.parse(file, {
        num_rows: numberOfLines,
        header: true,
        skipEmptyLines: true,
        chunkSize: papa_parse_chunkSize,
        beforeFirstChunk: function () {
            console.log("... starting ... before first chunk....")
        },
        chunk: async function (papa_results, parser) {
            parser.pause()
            let first_chunk = row == 0
            if (first_chunk) {
                if (missing_column(papa_results.meta.fields, soccer.version.required_columns)) {
                    parser.abort()
                    callbacks.onerror("Missing required columns: " + soccer.version.required_columns.toString());
                    throw new Error("missing required columns: ", soccer.version.required_columns.toString());
                }
            }
            let soccer_results = await code_chunk(papa_results.data, soccer, n)
            let writeChunkArgs = {
                n: n,
                first_chunk: first_chunk,
                input: papa_results.data,
                inputFields: papa_results.meta.fields,
                output: soccer_results,
            }
            await add_chunk_to_opfs(writeChunkArgs, writable);
            row += papa_results.data.length
            if (Function.isFunction(callbacks.chunk_complete)) {
                callbacks.chunk_complete(row, this.num_rows)
            }
            parser.resume()
        },
        complete: async function (results, file) {
            await writable.close()
            metadata.endTime = new Date();
            console.log(results.meta)
            if (!results.meta.aborted) {
                if (Function.isFunction(callbacks.chunk_complete)) {
                    callbacks.file_complete(outputFileHandle, metadata)
                }
            }
        }
    })
}




async function parseXLSX(file, soccer, n, callbacks) {
    // loading the data...
    const workbook = await XLSX.read(await file.arrayBuffer(), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet,{defval:""});
    const outputFields = Object.keys(data[0])
    let metadata = {
        soccerVersion: soccer.version.version,
        inputFilename: file.name,
        startTime: new Date(),
    }

    // set up the output as a csv file..
    const outputFileHandle = await getOPFSFileHandle(file)
    const writable = await outputFileHandle.createWritable();

    // parse the chunks...
    const chunkSize = 70;
    let nChunks = Math.ceil(data.length / chunkSize)
    let chunkId = 0
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        let first_chunk = i == 0;
        if (first_chunk) {
            if (missing_column(outputFields, soccer.version.required_columns)) {
                callbacks.onerror("Missing required columns: " + soccer.version.required_columns.toString());
                throw new Error("missing required columns: ", soccer.version.required_columns.toString());
            }
        }
        let soccer_results = await code_chunk(chunk, soccer, n)
        let writeChunkArgs = {
            n: n,
            first_chunk: first_chunk,
            input: chunk,
            inputFields: outputFields,
            output: soccer_results,
        }
        await add_chunk_to_opfs(writeChunkArgs, writable);
        chunkId++
        if (Function.isFunction(callbacks.chunk_complete)) {
            callbacks.chunk_complete(chunkId, nChunks)
        }
    }
    writable.close()
    if (Function.isFunction(callbacks.chunk_complete)) {
        callbacks.file_complete(outputFileHandle, metadata)
    }
}

async function code_chunk(chunk, soccer, n) {
    chunk = rowsToColumms(chunk)
    return soccer.code_chunk(chunk, n)
}

function rowsToColumms(array) {
    return array.reduce((acc, cur) => {
        let o = Object.keys(cur).forEach(k => {
            if (!Array.isArray(acc[k])) {
                acc[k] = [];
            }
            acc[k].push(cur[k] ?? " ")
        })
        return acc
    }, {})
}

function removeExtension(filename) {
    return filename.substring(0, filename.lastIndexOf('.')) || filename;
}

async function getOPFSFileHandle(file) {
    const root = await navigator.storage.getDirectory();
    let outputFilename = removeExtension(file.name) + "_soccer_output.csv"
    return root.getFileHandle(outputFilename, { create: true });
}

/**
 *  { 
 *      needs the input data for cols 1->x (input fields)
 *      needs the soccer restuls cols x->y (output fields)
 *      needs n
 *      needs wether or not it is the first chunk
 *      the writeable....
 *  }
 */
async function add_chunk_to_opfs(args, out) {
    let input_data = args.input
    let soccer_results = args.output
    let n = args.n
    let input_fields = args.inputFields

    let output_columns = Object.keys(soccer_results[0])
    let output_fields = []
    for (let i = 1; i <= n; i++) {
        output_columns.forEach((column) => output_fields.push(`${column}_${i}`))
    }

    // convert the results from an array of length n
    // to n columns of each code/title/score
    let data = input_data.map((input_row, indx) => {
        let row = {}
        input_fields.forEach((field) => {
            row[field] = input_row[field]
        })

        let output_row = soccer_results[indx]
        for (let i = 1; i <= n; i++) {
            output_columns.forEach((column) => {
                row[`${column}_${i}`] = output_row[column][i - 1]
            })
        }

        return row
    })

    let obj_to_write = {
        fields: [...input_fields, ...output_fields],
        data,
    }

    await out.write(Papa.unparse(obj_to_write, {
        header: args.first_chunk
    }) + "\n");
}

export async function download_ofps_file(fileHandle, metadata) {
    let outputFormat = document.getElementById("outputFormat").value
    switch (outputFormat) {
        case 'csv':
            await download_opfs_file(fileHandle, metadata);
            break;
        case 'xlsx':
            await download_xlsx(fileHandle, metadata);
            break;
        case 'json':
            await download_json_file(fileHandle, metadata);
            break;
    }
}

async function download_opfs_file(fileHandle, metadata) {
    let file = await fileHandle.getFile()
    let url = URL.createObjectURL(file);
    let a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
}

async function download_xlsx(fileHandle, metadata) {
    let file = await fileHandle.getFile()
    let outputFilename = file.name.replace(/\.csv$/, ".xlsx")
    var reader = new FileReader();
    reader.onload = function (e) {
        const csvData = e.target.result;
        const workbook = XLSX.read(csvData, { type: 'string' });
        if (!workbook.Props) workbook.Props = {};
        workbook.Props.Author = `${metadata.soccerVersion}`
        if (!workbook.Custprops) workbook.Custprops = {};
        workbook.Custprops['SOCcer Version'] = `${metadata.soccerVersion}`
        workbook.Custprops['Start Time'] = `${metadata.startTime}`
        workbook.Custprops['End Time'] = `${metadata.endTime}`

        // make sure the meta data are all strings...
        let worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let range = XLSX.utils.decode_range(worksheet['!ref']);
        let score_columns = [];
        for (let col = range.s.c; col < range.e.c; ++col) {
            let column_name = worksheet[XLSX.utils.encode_cell({ r: 0, c: col })]?.v
            if (column_name?.includes("score")) {
                score_columns.push(col);
            }
        }
        for (let row = range.s.r + 1; row <= range.e.r; ++row) {
            for (let col = range.s.c; col < range.e.c; ++col) {
                let cell_address = { c: col, r: row };
                let cell_ref = XLSX.utils.encode_cell(cell_address);
                if (worksheet[cell_ref]) {
                    worksheet[cell_ref].t = score_columns.includes(col) ? 'n' : 's'
                }
                //worksheet[cell_ref].t = score_columns.includes(col)?'n':'s'
                //if(worksheet[cell_ref]?.t == 'n')  worksheet[cell_ref].t = 's';
            }
        }

        XLSX.writeFile(workbook, outputFilename, { type: "binary", bookType: "xlsx" })
    };
    reader.readAsArrayBuffer(file)
}


async function download_json_file(fileHandle, metadata) {
    download_opfs_file(fileHandle, metadata)
}

function missing_column(fields, required_columns) {
    console.log(`required columns: ${required_columns} fields: ${fields}`)
    return !required_columns.reduce((acc, cv) => acc && fields.includes(cv), true)
}