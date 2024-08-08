import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm'
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"

let workerReady = false;
let fileButton = document.getElementById("file")
let progressbar = document.getElementById("coding")
let percent = document.getElementById("pct")
let outputFormatElement = document.getElementById("outputFormat")

var worker = new Worker('soccerWorker.js', {type:'module'} );

worker.onmessage = function (e) {
    //console.log("I received a message from the worker...", e)
    switch (e.data.type) {
        case "initialized":
            // the worker is ready to get a version...
            // post a message telling the worker to use version 3.0.4
            worker.postMessage({ type: "version", version: "3.0.4" });
            break;
        case "ready":
            workerReady = true;
            console.log("... the worker is ready...")
            break;
        case "error":
            console.error("... error in worker:", e.data.error)
            fileButton.disabled=false;
            fileButton.value=null;
            break;
        case "update":
            let pct = Math.round(e.data.completed/e.data.total * 10000) / 100;
            console.log(`${e.data.completed}/${e.data.total} ${pct}%`);
            percent.innerText=`${pct}%`;
            progressbar.value = pct;
            break;
            case "parse_complete":
                download_ofps_file( e.data.fileHandle,e.data.metadata );
                fileButton.disabled=false;
                fileButton.value=null;
                outputFormatElement.disabled=false
                break;
        default:
            console.error("... unknown message from worker: ",e.data.type)
    }
}


//  I cannot download the OPFS results from the webworker because
//  the webworker does not have access to document.
async function download_ofps_file(fileHandle,metadata){
    let outputFormat = document.getElementById("outputFormat").value
    console.log(outputFormat)
    switch (outputFormat){
        case 'csv':
            await download_opfs_file(fileHandle,metadata);
            break;
        case 'xlsx':
            await download_xlsx(fileHandle,metadata);
            break;
        case 'json':
            await download_json_file(fileHandle,metadata);
            break;
    } 
//    const opfsRoot = await navigator.storage.getDirectory();
//    opfsRoot.removeEntry(file.name)
}
async function download_opfs_file(fileHandle,metadata) {
    let file=await fileHandle.getFile()
    let url = URL.createObjectURL(file);
    let a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
}
async function download_xlsx(fileHandle,metadata) {
    let file = await fileHandle.getFile()
    let outputFilename = file.name.replace(/\.csv$/,".xlsx")
    var reader = new FileReader();
    reader.onload = function(e) {
        const csvData = e.target.result;
        const workbook = XLSX.read(csvData, {type: 'string'});
        if (!workbook.Props) workbook.Props = {};
        workbook.Props.Author = `SOCcer ${metadata.soccerVersion}`
        if (!workbook.Custprops) workbook.Custprops = {};
        workbook.Custprops['SOCcer Version']=`${metadata.soccerVersion}`
        workbook.Custprops['Start Time'] = `${metadata.startTime}`
        workbook.Custprops['End Time'] = `${metadata.endTime}`

        // make sure the meta data are all strings...
        let worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let range = XLSX.utils.decode_range(worksheet['!ref']);
        console.log(range)
        let score_columns = [];
        for(let col = range.s.c; col < range.e.c; ++col) {
            let column_name = worksheet[XLSX.utils.encode_cell({r:0,c:col})]?.v
            if (column_name?.includes("score")){
                score_columns.push(col);
            }
        }
        for(let row = range.s.r+1; row <= range.e.r; ++row) {
            for(let col = range.s.c; col < range.e.c; ++col) {
                let cell_address = {c: col, r: row};
                let cell_ref = XLSX.utils.encode_cell(cell_address);
                if (worksheet[cell_ref]){
                    worksheet[cell_ref].t = score_columns.includes(col)?'n':'s'
                }
                //worksheet[cell_ref].t = score_columns.includes(col)?'n':'s'
                //if(worksheet[cell_ref]?.t == 'n')  worksheet[cell_ref].t = 's';
            }
        }

        XLSX.writeFile(workbook,outputFilename,{type:"binary",bookType:"xlsx"})
    };
    reader.readAsArrayBuffer(file)
}
async function download_json_file(fileHandle, metadata) {
    let file = await fileHandle.getFile()
    let outputFilename = file.name.replace(/\.csv$/,".json")

    const reader = new FileReader();
    reader.onload = function (e) {
        const csv = e.target.result;
        Papa.parse(csv, {
            header: true,
            dynamicTyping: true,
            complete: function (results) {
                let jsonString = JSON.stringify(results.data);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = outputFilename;
                a.click();
                URL.revokeObjectURL(url);
            }
        });
    }
    await reader.readAsText(file);
}





fileButton.addEventListener("change",(event) => {
    let file = event.target.files[0];
    worker.postMessage({type:"parse_file","file":file})
    fileButton.disabled=true
    outputFormatElement.disabled=true
})






















/*

// I give up trying to load tfjs as an esm (no loadLayersModel... Why???)
// Make sure you do script tag loading.
import { pipeline} from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@latest';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm'
import localforage from 'https://cdn.jsdelivr.net/npm/localforage@1.10.0/+esm'
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"
//import * as tf from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/+esm'
//console.log("tf:", tf)



// I may need to shove this is github and read from there...
let abbrev_path = /^\/test/.test(location.pathname)?"../abbrev.json":"abbrev.json"
let abbrev = await (await fetch(abbrev_path)).json()
const abbrev_keys = Object.keys(abbrev)
abbrev = Object.fromEntries(Object.entries(abbrev).filter(([key, value]) => !Array.isArray(value)))

// This is called from a webworker... dont use window!!
//window.abbrev = abbrev

//await tf.ready()
//console.log(await tf.getBackend());

async function openOutputFile(){
    if (!'showSaveFilePicker' in window) {
        throw new Error("showSaveFilePicker is not supported on this browser")
    } 
    const newHandle = await window.showSaveFilePicker();
}




/// cache the soc2010 codes...
const soc2010_cache = localforage.createInstance({
    name:"soccer3_cache",
    storeName:"soc2010"
})
async function get_soc2010() {
    const soc2010_map = new Map()
    if (await soc2010_cache.length() == 0) {
        console.log("... cacheing SOC2010")
        let soc2010 = (await (await fetch("https://danielruss.github.io/codingsystems/soc2010_6digit.json")).json())
            .filter(x => x.soc_code != "99-9999")
        
        for (let i = 0; i < soc2010.length; i++) {
            let current_soc = {
                index: i,
                code: soc2010[i].soc_code,
                title: soc2010[i].title
            }
            soc2010_map.set(current_soc.code, current_soc)
            await soc2010_cache.setItem(current_soc.code, current_soc)
        }
    } else {
        // load from cache...
        soc2010_cache.iterate((value, key, indx) => {
            soc2010_map.set(key, value)
        })
    }
    return soc2010_map
}
const soc2010_6digit = await get_soc2010()
//window.soc2010_6digit =soc2010_6digit

/// cache the crosswalks in localforage....
const crosswalk_cache = localforage.createInstance({
    name:"soccer3_cache",
    storeName:"crosswalks"
})
async function buildCrossWalk(url,system){
    if ( !await crosswalk_cache.getItem(system) ){
        console.log("building XW: ",url)
        const raw = await (await fetch(url)).json()
        const xw = raw.reduce( (acc,current) =>{
            if (!acc.has(current[system])){
                acc.set(current[system],[])
            }
            acc.get(current[system]).push(current['soc2010'])
            return acc;
        },new Map() )
        crosswalk_cache.setItem(system,xw)
    }
}
const knownCrosswalks = new Map([
    ["soc1980", "https://danielruss.github.io/codingsystems/soc1980_soc2010.json"],
    ["noc2011", "https://danielruss.github.io/codingsystems/noc2011_soc2010_via_soc2018.json"],
    ["soc2018", "https://danielruss.github.io/codingsystems/soc2010_soc2018.json"]
])
knownCrosswalks.forEach((url,system)=>{
    buildCrossWalk(url,system)    
})


export async function crosswalk_one_job(system,code){
    if (!knownCrosswalks.has(system)) throw new Error(`Unknow coding system: ${system}`)
    const xw = await crosswalk_cache.getItem(system)
    let mhe = tf.buffer([1,840])
    let soc2010_codes = xw.get(code)

    if (soc2010_codes?.length>0){
        soc2010_codes.forEach( soc_code => {
            let info = soc2010_6digit.get(soc_code)
            mhe.set(1.,0,info.index)
        })
    }
    return mhe.toTensor()
}

export async function crosswalk(system,codes){
    // this inner function crosswalks 1 code to 
    // a multi-hot encoding.  xw is the crosswalk
    // code is the code we are crosswalking to soc2010
    // index is the id of the job.
    function xw_one(xw,code,index,buffer){
        let soc2010_codes = xw.get(code)
        if (!soc2010_codes) return
        soc2010_codes.forEach( soc_code => {
            let info = soc2010_6digit.get(soc_code)
            buffer.set(1.,index,info.index) 
        })
    }

    if (!knownCrosswalks.has(system)) throw new Error(`Unknow coding system: ${system}`)
    const xw = await crosswalk_cache.getItem(system)
    if (!Array.isArray(codes)) codes = [codes]

    let mhe = tf.buffer([codes.length,840])
    // for each job. cross walk the other code.
    // if there are multiple codes for a job, get all the codes.
    codes.map( (code,index) => {
        if (Array.isArray(code)){
            code.forEach( cd=> xw_one(xw,cd,index,mhe))
        } else {
            xw_one(xw,code,index,mhe)
        }
    })
    return mhe.toTensor()
}

//window.crosswalk = crosswalk
//const pb=document.getElementById("pb")
const pb=document.getElementById("my-progressbar")
// This needs to be passed in...
function callback(progressData){
    // update the label:
    console.log(`${progressData.parsedLines}/${progressData.numLines} ${progressData.numLines==0?0.00:(progressData.parsedLines/progressData.numLines).toFixed(3)}`)
    if (pb){
        pb.classList.remove('d-none')
        let ele = pb.querySelector(".progress-label")
        if (ele) ele.innerText= progressData.parsedLines == progressData.numLines?"Completed":"Running"
        ele = pb.querySelector(".progress-bar")
        if (ele) {
            let val = progressData.numLines==0?0:100.*progressData.parsedLines/progressData.numLines
            val=`${Math.round(val)}%`
            ele.style.width=val
            ele.innerText=val
        }
        pb.querySelector("#file-name").innerHTML=`${progressData.inputFile} &rarr; ${progressData.outputFile}`;
    }
}

function error_callback(progressData){
    progressData.numLines = progressData.numLines ?? 0;
    progressData.parsedLines = progressData.parsedLines ?? 0;
    if (pb){
        pb.classList.remove('d-none')
        let ele = pb.querySelector(".progress-label")
        if (ele) ele.innerText= "Error"
        ele = pb.querySelector(".progress-bar")
        if (ele) {
            let val = progressData.numLines==0?0:100.*progressData.parsedLines/progressData.numLines
            val=`${Math.round(val)}%`
            ele.style.width=val
            ele.innerText=val
        }
        pb.querySelector("#file-name").innerHTML=progressData.error;
    }
    reset()
}

function reset(){
    if(pb){
        pb.value=0;
    }
    let fileElement = document.getElementById("file");
    if (fileElement){
        fileElement.value=""
        fileElement.disabled=false;
    }
}




async function createOPFSWriter(filename){
    const opfsRoot = await navigator.storage.getDirectory();
    for await (const [key, value] of opfsRoot.entries()) {
        if (value.kind == "file"){
            const file = await value.getFile();
            if (file.stream && file.stream.locked) {
                await file.stream.close();
            }
        }
        console.log(`removing: ${key}`);
        opfsRoot.removeEntry(key)
    }
    const fileHandle = await opfsRoot.getFileHandle(filename, {
        create: true,
      });
    return await fileHandle.createWritable()
}


export async function codeSingleJob(args){
    let soccer3 = new SOCcer3(args.soccerVersion)
    console.log(soccer3.version)
    let JobTitleTask = preprocessTextInput(args)

    let xw_tensor = args.xw_tensor;
    let res = await soccer3.code(JobTitleTask,xw_tensor)
    let n=args.n??10
    let r2 = tf.topk(res,n)
    xw_tensor.dispose()
    res.dispose();

    let soc2010_array=Array.from(soc2010_6digit.keys())
    let results = {
        soc2010: r2.indices.flatten().arraySync().map(ind => soc2010_6digit.get(soc2010_array[ind])),
        score: r2.values.flatten().arraySync()
    }
    console.log(results)
    return results;
}

export async function parseCSV(file,args){
    if (file.type != "text/csv"){
        throw new Error("Not a CSV file")
    }
    let n = args.n ?? 10;
    let format = args.format ?? "csv"

    const parseData = {
        soccer3: new SOCcer3(args.soccerVersion),
        writer: null,
        fileSize:file.size,
        inputFile:file.name,
        numLines:0,
        chunkId:0,
        parsedLines:0,
        outputFile:file.name.replace(".csv", `_soccer_output.${format}`),
        outputFormat: format,
        n: n,
        includeTitles: args.includeTitles ?? false
    }

    parseData.writer = await createOPFSWriter(parseData.outputFile)

    const csv_count = {
        header: true,
        skipEmptyLines: true,
        beforeFirstChunk : function(){
            parseData.numLines=0
        },
        step: function (results, parser) {
            if (parseData.numLines == 0) {
                parseData.fields = results.meta.fields;
                if (!(results.meta.fields.includes("JobTask") &&
                    results.meta.fields.includes("JobTitle"))) {
                    parseData.error = "File must have columns labeled <b>JobTitle</b> and <b>JobTask</b> "
                    error_callback(parseData)
                    parser.abort()
                    return
                }
            }
            parseData.numLines++
        },
        complete: function(){
            if (!parseData.error) Papa.parse(file,csv_parse)
        }
    }

    const csv_parse ={
        chunkSize: 8*1024,
        header: true,
        skipEmptyLines: true,
        beforeFirstChunk : function(){
            parseData.parsedLines=0
        },
        chunk : async function(results,parser){
            parser.pause()
            if (parseData.chunkId == 0) console.log(results)
            parseData.chunkId++
            console.log(`working on chunk ${parseData.chunkId}: ${results.data.length}`)
            try{
                let chunk_results = await parse_chunk(results,parseData)
                await write_chunk_to_opfs(chunk_results,parseData)
                parseData.parsedLines+=results.data.length
                callback(parseData)
                parser.resume()
            }catch(error){
                console.log(results.data)
                parseData.error = error
                error_callback(parseData)
                parser.abort()
            }
        },
        complete: function(){
            console.log("all done...")
            // close the OPFS file stream...
            parseData.writer.close()
            if(parseData.outputFormat=="xlsx") {
                download_excel_file(parseData)
            } else {
                download_ofps_file(parseData)
            }
            reset()
        }
    }

    Papa.parse(file,csv_count)
}


async function download_ofps_file(parseData){
    const filename = parseData.outputFile
    const opfsRoot = await navigator.storage.getDirectory();
    const fileHandle = await opfsRoot.getFileHandle(filename);

    let file=await fileHandle.getFile()
    let text=await(file.text())
    if (parseData.outputFormat == "json"){
        text = text.replaceAll("][",",")
    }
    let blob = new Blob([text], {type: "octet/stream"})
    let url = window.URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    opfsRoot.removeEntry(filename)
}

async function download_excel_file(parseData){
    // read the CSV file...
    const reader = new FileReader();
    reader.onload = function(e) {
        const csvData = e.target.result;
        const workbook = XLSX.read(csvData, {type: 'string'});

        // make sure the meta data are all strings...
        let worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let range = XLSX.utils.decode_range(worksheet['!ref']);
        for(let row = range.s.r; row <= range.e.r; ++row) {
            for(let col = 0; col < parseData.fields.length; ++col) {
                let cell_address = {c: col, r: row};
                let cell_ref = XLSX.utils.encode_cell(cell_address);
                if(worksheet[cell_ref]?.t == 'n')  worksheet[cell_ref].t = 's';
            }
        }

        XLSX.writeFile(workbook,parseData.outputFile,{type:"binary",bookType:"xlsx"})
    }

    const opfsRoot = await navigator.storage.getDirectory();
    const fileHandle = await opfsRoot.getFileHandle(parseData.outputFile);
    const file = await fileHandle.getFile()
    reader.readAsText(file);
}

async function parse_and_write_csv(chunk_results,parseData){
    // create an array of arrays for writing csv with Papa.parse
    let chunk_obj = {        
        "fields":[],
        "data":[]
    }
    let quotes = []
    let chunk_len = chunk_results.codes.length
    let n = chunk_results.codes[0].length
    
    chunk_results.fields.forEach( (col) => {
        chunk_obj.fields.push(col)
        quotes.push(true)
    })
    for (let col = 0;col<n;col++) {
        chunk_obj.fields.push(`soc2010_${col+1}`)
        if (parseData.includeTitles) chunk_obj.fields.push(`title_${col+1}`)
        chunk_obj.fields.push(`score_${col+1}`)
        quotes.push(true,false)
    }

    for (let row=0;row<chunk_len;row++){
        let row_data = []
        chunk_results.fields.forEach( col => {
            row_data.push(chunk_results.input[row][col])
        })       
        for (let col=0;col<n;col++){
            row_data.push(chunk_results.codes[row][col])
            if (parseData.includeTitles) row_data.push(soc2010_6digit.get(chunk_results.codes[row][col]).title)
            row_data.push(chunk_results.scores[row][col])
        }
        chunk_obj.data.push(row_data)
    }
    // The chunk_obj has fields/data keys, so we are ready to use papa.unparse 
    let config = {header:parseData.chunkId == 1,quotes:quotes,newline: "\n"}
    let csvText=Papa.unparse(chunk_obj,config) + config.newline

    let opfsStream = parseData.writer;
    await opfsStream.write(csvText)
}

async function parse_and_write_json(chunk_results,parseData){
    let opfsStream = parseData.writer;
    let numberOfRowsInChunk = chunk_results.codes.length
    let n = chunk_results.codes[0].length

    // create an object for each row, and write it to the 
    // OPFS file...
    let json_array=[]
    for (let row=0;row < numberOfRowsInChunk; row++){
        let row_object = {}
        chunk_results.fields.forEach((key)=>{
            row_object[key] = `chunk_results.input[row][key]`
        })
        for (let rank = 0;rank<n;rank++){
            row_object[`soc2010_${rank+1}`]=chunk_results.codes[row][rank]
            if (parseData.includeTitles) row_object[`title_${rank+1}`]=soc2010_6digit.get(chunk_results.codes[row][rank]).title
            row_object[`score_${rank+1}`]=chunk_results.scores[row][rank]
        }
        json_array.push(row_object)
    }
    console.log(json_array)
    await opfsStream.write(JSON.stringify(json_array,null,2) );
}

async function write_chunk_to_opfs(chunk_results,parseData){
    if (parseData.outputFormat == "json"){
        await parse_and_write_json(chunk_results,parseData)
    } else {
        // Excel and CSV write to CSV first...
        await parse_and_write_csv(chunk_results,parseData)
    }
}


function preprocess_one_line(args){
    // handle NA/NaN/empty arguments
    args.JobTitle ??= " ";
    args.JobTask ??= " ";

    // clean the JobTitle/JobTask...
    args.JobTitle = args.JobTitle
        .replaceAll(/^[\s\-\.]+|[\s\-\.]+$/g,"")
        .toLowerCase()
    args.JobTask = args.JobTask
        .replaceAll(/^[\s\-\.]+|[\s\-\.]+$/g,"")
        .toLowerCase()
    // handle abbreviations...
    args.JobTitle = Object.hasOwn(abbrev,args.JobTitle)?abbrev[args.JobTitle]:args.JobTitle
    args.JobTask = Object.hasOwn(abbrev,args.JobTask)?abbrev[args.JobTask]:args.JobTask

    // combine the job title and job task
    args.JobTitleTask = `${args.JobTitle} ${args.JobTask}`.trim();
    return args;
}
function preprocess(data,parseData){
    let preprocessed_data = data.map( (row,indx) => {
        row = preprocess_one_line(row)
        row.Id=row.Id ?? `row-${(indx+parseData.parsedLines).toString().padStart(6,'0')}`
        return row;
    })
    return preprocessed_data
}
function preprocessTextInput(args){
    args=preprocess_one_line(args)
    return args.JobTitleTask;
}

async function parse_chunk(result,parseData){

    // preprocess the data...
    let preprocessed_data = preprocess(result.data,parseData);
    let fields = [...result.meta.fields]
    if ( !(fields.includes("Id")||fields.includes("id")) ){
        fields.unshift("Id")
    }
    
    // crosswalk soc1980, noc2011, soc2018
    // if no crosswalk, just pass in zeros...
    let xw_tensor = tf.zeros( [result.data.length,840] )
    if (fields.some(col => knownCrosswalks.has(col))){
        let xw_obj={}
        knownCrosswalks.forEach( (value,key) => xw_obj[key]=[])
        for (const row of result.data){
            xw_obj.soc1980.push(row?.soc1980)
            xw_obj.noc2011.push(row?.noc2011)
            xw_obj.soc2018.push(row?.soc2018)
        }
        // crosswalk any coded column
        for ( const key of knownCrosswalks.keys()){
            if (fields.includes(key)){
                let soc2010_xw = await crosswalk(key,xw_obj[key])
                xw_tensor = tf.maximum(xw_tensor,soc2010_xw)
                tf.dispose(soc2010_xw)
            }
        }
    }
    let jobTitleTask=preprocessed_data.map(row=>row.JobTitleTask)
    let res = await parseData.soccer3.code(jobTitleTask,xw_tensor)
    res =  analyze_chunk(res,parseData)
    res.input=preprocessed_data
    res.fields=fields
    return res
}

function analyze_chunk(tensor,parseData){
    let soc2010_array=Array.from(soc2010_6digit.keys())
    let sorted_results=tf.topk(tensor,parseInt(parseData.n))
    tensor.dispose()
    let codes = sorted_results.indices.arraySync().map( row=> row.map(v => soc2010_array[v] ))
    let scores = sorted_results.values.arraySync()
    sorted_results.indices.dispose()
    sorted_results.indices.dispose()

    return {
        codes: codes,
        scores: scores
    }
}
    */