import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm'
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"
import { SOCcer3, availableCodingSystems } from "./soccer3.js";

let soccer = null;
// this is set to balance speed vs update time
let papa_parse_chunkSize = 4 * 1024;

self.onmessage = async function (e) {
    switch (e.data?.type) {
        case "version":
            soccer = new SOCcer3(e.data.version)
            await soccer.wait_until_ready();
            postMessage({ type: "ready" })
            break;
        case "versions":
            postMessage({ soccerVersion: soccer.version, n: this.n })
            break;
        case "parse_file":
            if (!soccer) {
                console.error("Falsy Soccer: ", soccer)
                postMessage({ type: "error", error: "soccer is not defined yet." })
            }
            parse_file(e.data.file)
            break;
        default:
            console.error(`Unkown message type in the soccerWorker: ${e.data?.type}`)
    }
}



/*******************************************************************
 *  PARSE CSV
 *******************************************************************/
function removeExtension(filename) {
    return filename.substring(0, filename.lastIndexOf('.')) || filename;
}

async function parse_file(file) {
    switch (file.type) {
        case "text/csv":
            parse_csv(file)
            break;
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            parse_xlsx(file)
            break;
        default:
            console.error(`Cannot handle files of type ${file.type}`)
    }
}
async function parse_csv(file) {
    let rows = 0;
    let firstChunk = true;

    // get the OPFS root...
    const root = await navigator.storage.getDirectory();
    let outputFilename = removeExtension(file.name) + "_soccer_output.csv"
    const outputFileHandle = await root.getFileHandle(outputFilename, { create: true });
    let metadata = {
        soccerVersion: soccer.version,
        inputFilename: file.name,
        startTime: new Date(),
    }
    const writable = await outputFileHandle.createWritable();


    Papa.parse(file, {
        skipEmptyLines: true,
        header: true,
        chunkSize: papa_parse_chunkSize,
        chunk: async function (results, parser) {
            parser.pause()
            results.meta.start_row = rows;
            let soccer_results = await soccer.code_papa_chunk(results)
            await add_chunk_to_opfs(soccer_results, writable, firstChunk);
            //send an update...
            rows += results.data.length;
            postMessage({ type: "update", completed: results.meta.cursor, total: parser.streamer._input.size, rows: rows });
            firstChunk = false;
            parser.resume()
        },
        complete: async function (results, file) {
            await writable.close()
            metadata.endTime = new Date();
            postMessage({ type: "parse_complete", fileHandle: outputFileHandle, metadata: metadata });
        }
    })
}
async function parse_xlsx(file) {
    const workbook = await XLSX.read(await file.arrayBuffer(), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // get the OPFS root...
    const root = await navigator.storage.getDirectory();
    let outputFilename = removeExtension(file.name) + "_soccer_output.csv"
    const outputFileHandle = await root.getFileHandle(outputFilename, { create: true });
    let metadata = {
        soccerVersion: soccer.version,
        inputFilename: file.name,
        startTime: new Date(),
    }
    const writable = await outputFileHandle.createWritable();

    const chunkSize = 25;

    let fields = Object.keys(data[0])
    console.log(fields)
    for (let row = 0; row < data.length; row += chunkSize) {
        let firstChunk = row == 0;
        let lastRow = Math.min(row + chunkSize, data.length)
        let chunk = data.slice(row, lastRow);
        console.log(`chunk ${row} -> ${lastRow - 1}`)

        //data{Id,JobTitle,JobTask,soc1980...}
        // meta start_row and maybe fields...
        // handle the chunk .. make it look like papa.parse...
        let results = {
            data: chunk,
            meta: {
                start_row: row,
                fields: fields
            }
        }
        let soccer_results = await soccer.code_papa_chunk(results)
        await add_chunk_to_opfs(soccer_results, writable, firstChunk);
        postMessage({ type: "update", completed: lastRow, total: data.length, rows: lastRow });
        firstChunk = false;

    }
    await writable.close()
    metadata.endTime = new Date();
    postMessage({ type: "parse_complete", fileHandle: outputFileHandle, metadata: metadata });
}


/*******************************************************************
 *  results handling
 *******************************************************************/
async function add_chunk_to_opfs(results, out, firstChunk) {
    // either add CSV or JSON to the output.
    // the client will deal the conversion...
    await add_csv_chunk(results, out, firstChunk)
}

async function add_csv_chunk(results, out, firstChunk) {
    // create the fields order...
    let all_fields = results.fields;
    for (let i = 1; i <= results.codes[0].length; i++) {
        all_fields.push(`soc2010_${i}`, `title_${i}`, `score_${i}`)
    }

    // make and fill an object for papa parse...
    let data_to_write = {
        fields: all_fields,
        data: []
    }
    for (let i = 0; i < results.input.length; i++) {
        let obj = {}
        for (let field of results.fields) {
            obj[field] = results.input[i][field]
        }
        for (let j = 0; j < results.codes[0].length; j++) {
            obj[`soc2010_${j + 1}`] = results.codes[i][j];
            obj[`title_${j + 1}`] = results.titles[i][j];
            obj[`score_${j + 1}`] = results.scores[i][j];
        }
        data_to_write.data.push(obj);
    }

    await out.write(Papa.unparse(data_to_write, { header: firstChunk }) + "\n");
}


self.postMessage({ type: "initialized" })




/*
let transformers = null;
let extractor = null;
let tf = null;
let soccer_model = null;
let soc2010 = null;
let abbrev =null;
let abbrev_keys =null;


async function init(){
    transformers = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.11.0")
    extractor = await transformers.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2",{ quantized: false })
    tf = await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/+esm')
    soccer_model = await tf.loadLayersModel('http://localhost:8000/SOCcer3_v0.1.tfjs/model.json');
    soc2010 = await (await fetch("https://danielruss.github.io/codingsystems/soc_2010_6digit.json")).json()
    abbrev = await (await fetch("abbrev.json")).json()
    abbrev_keys = Object.keys(abbrev)
    // remove abbreviations that have more than 1 value.  (i.e. is an array)
    abbrev = Object.fromEntries(Object.entries(abbrev).filter(([key, value]) => !Array.isArray(value)))
    importScripts("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.js")
    postMessage({type:"Ready"})
}
init()




function ready(){
    return transformers!=null
}

self.onmessage = async function (event) {
    switch (event.data.type) {
        case "embed":{
            console.log(event.data)
            let soccerInput = [{
                JobTitle: event.data.jobTitle,
                JobTask: event.data.jobTask
            }]
            let result = await soccer(soccerInput);
            console.log(result)
            self.postMessage({ type: "embed1", predictions:result })
            break;
        }
        case "embedFile":{
            postMessage({type:"Status",status:"<b>parsing CSV file</b>"})
            Papa.parse(event.data.file, {
                skipEmptyLines: true,
                header:true,
                complete: async (results,file) => {
                    postMessage({type:"Status",status:"<b>Finished parsing CSV file - Running SOCcer 3.0</b>"})
                    console.time("soccer")
                    let soccerResults = await soccer(results.data)
                    console.timeEnd("soccer")
                    postMessage({type:"Status",status:"<b>Finished running SOCcer 3.0</b>"})
                    postMessage({type:"Results","results":soccerResults,"file":file.name})
                }
            })
            break;
        }
    }
};

function preprocessJTT(title,task){
    let JTT = `${title} ${task}`.replaceAll(/^\-+|\-+$/g,"")
       .toLowerCase()
    // remove na and dk
    JTT=JTT.replaceAll(/\bna\b|\bdk\b/g,"").replaceAll("/\s+/g"," ")
    // replace abbreviations
    JTT=JTT.split(" ").map( (tkn) => abbrev_keys.includes(tkn)? abbrev[tkn]:tkn ).join(" ").trim()
    

    return {JobTitle:title,JobTask:task,text:JTT}
}

function sortIndices(array1d){
    return array1d.map( (val,index)=>[val, index])
        .sort( (a,b) => b[0]-a[0])
        .map(a=>a[1])
}

function getTopNPrediction(prediction_tensor,input,n=10){
    let scores = prediction_tensor.arraySync()
    let sorted = scores.map( (prediction)=> sortIndices(prediction))
    
    let predictions=sorted.map( (result,rowNumber) => {
        let results=result.slice(0,n).map( (indx)=> ({
            code: soc2010[indx].code,
            title: soc2010[indx].title,
            score:scores[rowNumber][indx],
        }))
        return {
            input:input[rowNumber],
            results: results
        }
    })
    return predictions
}


function chunkArray(array, size) {
    return array.reduce((result, value, index) => {
        if (index % size === 0) {
            result.push(array.slice(index, index + size));
        }
        return result;
    }, []);
}

async function soccer(soccerInput){
    let input = soccerInput.map( (job) => preprocessJTT(job.JobTitle,job.JobTask) )
    //input = input.slice(0,300)
    // break into chunks of 100 so that I can update the 
    // user on my progress.  On my mac M1, this takes
    // about 1.5 secs/chunk.  It is more efficient to have 
    // larger chunks, but it takes longer to run and update the user...

    let promises = chunkArray(input,100).map( async (chunk,index,chunkArray) => {
        console.log(" start embeding: ",index,chunkArray.length)
        postMessage(
            {type:"Status",task:"embed",n:chunkArray.length,index:index+1,status:`<b>Finished embedding chunk ${index+1} of ${chunkArray.length}</b>`})
        let embeddings = await embed(chunk)
        console.log(" finished embeding: ",index,chunkArray.length)
        let results = runSOCcerModel(embeddings,chunk)
        console.log("finished coding: ",index,chunkArray.length)
        postMessage(
            {type:"Status",task:"SOCcer",n:chunkArray.length,index:index+1,status:`<b>Finished coding chunk ${index+1} of ${chunkArray.length}</b>`})
        return results;
    })
    let soccerResults = (await Promise.all(promises)).flat()
    return soccerResults;    
}

function embed(jttArray) {
    return Promise.all(
        jttArray.map( async (job,index,array) => extractor(job.text, { pooling: "mean", normalize: true })
    ))
}

function runSOCcerModel(embeddings,text){
    console.log("... running soccer model ...")
    let predictions=null;
    tf.tidy(() => {
        // convert the embeddings from an array to a tensor
        let x_tensor = tf.tensor2d(embeddings.map( (t) => t.data))
        x_tensor.print()
        let y_tensor = soccer_model.predict(x_tensor)
        predictions = getTopNPrediction(y_tensor,text)
    })
    return predictions;
}

console.log("... IN WORKER ...")


function getTopPrediction(prediction_tensor,text){
    console.log(text)
    let scores = prediction_tensor.dataSync()
    let indices = tf.argMax(prediction_tensor,axis=1)
    let results = Array.from(indices.dataSync()).map( (index,job) => {
        return {
            code: soc2010[index].code,
            title: soc2010[index].title,
            score: scores[index],
            input: text[job]
        }
    })
    indices.dispose()
    return results
}

async function code1JTT(title, task) {
    let input = [ preprocessJTT(title, task) ]
    self.postMessage({ jtt: input[0].text })
    let embeddings = await extractor(input[0].text, { pooling: "mean", normalize: true })
    let predictions=null;
    tf.tidy(() => {
        let x_tensor = tf.tensor2d(embeddings.data, [1, embeddings.size])
        let y_tensor = soccer_model.predict(x_tensor)
        predictions = getTopNPrediction(y_tensor,input)
    })
    return predictions;
}
*/