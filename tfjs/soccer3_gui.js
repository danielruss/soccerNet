import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm'
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"
import { SOCcer3 } from './soccer3.mjs';

let workerReady = false;
let fileButton = document.getElementById("file")
let progressbar = document.getElementById("coding")
let percent = document.getElementById("pct")
let outputFormatElement = document.getElementById("outputFormat")

var worker = new Worker('soccerWorker.js', { type: 'module' });

worker.onmessage = function (e) {
    switch (e.data.type) {
        case "initialized":
            // the worker is ready to get a version...
            // post a message telling the worker to use version 3.0.4
            worker.postMessage({ type: "version", version: "3.0.4" });
            break;
        case "ready":
            workerReady = true;
            break;
        case "error":
            console.error("... error in worker:", e.data.error)
            fileButton.disabled = false;
            fileButton.value = null;
            break;
        case "update":
            let pct = Math.round(e.data.completed / e.data.total * 10000) / 100;
            console.log(`${e.data.completed}/${e.data.total} ${pct}%`);
            percent.innerText = `${pct}%`;
            progressbar.value = pct;
            break;
        case "parse_complete":
            download_ofps_file(e.data.fileHandle, e.data.metadata);
            fileButton.disabled = false;
            fileButton.value = null;
            outputFormatElement.disabled = false
            break;
        default:
            console.error("... unknown message from worker: ", e.data.type)
    }
}


//  I cannot download the OPFS results from the webworker because
//  the webworker does not have access to document.
async function download_ofps_file(fileHandle, metadata) {
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
    //    const opfsRoot = await navigator.storage.getDirectory();
    //    opfsRoot.removeEntry(file.name)
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
        workbook.Props.Author = `SOCcer ${metadata.soccerVersion}`
        if (!workbook.Custprops) workbook.Custprops = {};
        workbook.Custprops['SOCcer Version'] = `${metadata.soccerVersion.version}`
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
    let file = await fileHandle.getFile()
    let outputFilename = file.name.replace(/\.csv$/, ".json")

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





fileButton.addEventListener("change", (event) => {
    percent.innerText = ``;
    progressbar.value = 0;
    let file = event.target.files[0];
    worker.postMessage({ type: "parse_file", "file": file })
    fileButton.disabled = true
    outputFormatElement.disabled = true
})


const tableElement = document.getElementById("oneResults");
HTMLTableRowElement.prototype.insertHead = function () {
    let cell = document.createElement("th")
    this.insertAdjacentElement("beforeend", cell)
    return cell
}
function makeResultsTable(res, tableElement) {
    let ncodes = res.codes[0].length
    tableElement.innerText = "";

    // make the table head...
    const myhead = tableElement.createTHead();
    const myHeadRow = myhead.insertRow()
    res.fields.forEach(field => {
        const th = myHeadRow.insertHead()
        th.innerText = field
    });
    for (let rank = 0; rank < ncodes; rank++) {
        const th1 = myHeadRow.insertHead()
        th1.innerText = `soc2010_${rank + 1}`
        const th2 = myHeadRow.insertHead()
        th2.innerText = `title_${rank + 1}`
        const th3 = myHeadRow.insertHead()
        th3.innerText = `score_${rank + 1}`
    }

    // make the table body
    let mybody = tableElement.createTBody();
    for (let row = 0; row < res.codes.length; row++) {
        const tr = mybody.insertRow()
        // for each row fill the input...
        res.fields.forEach(field => {
            const td = tr.insertCell();
            td.innerText = res.input[row][field]
        })
        // now the results...
        for (let rank = 0; rank < ncodes; rank++) {
            const td = tr.insertCell();
            td.innerText = res.codes[row][rank]
            const td2 = tr.insertCell();
            td2.innerText = res.titles[row][rank]
            const td3 = tr.insertCell();
            td3.innerText = res.scores[row][rank].toFixed(4)
        }

    }
}

document.getElementById("code1Job").addEventListener("click", async (event) => {
    let id = "job"
    let title = document.getElementById("oneTitle").value;
    let task = document.getElementById("oneTask").value;
    let soc1980 = document.getElementById("oneSoc1980").value;
    let noc2011 = document.getElementById("oneNoc2011").value;
    console.log(`${title} ${task} ${soc1980} ${noc2011}`)
    let xw = {}
    if (soc1980) xw.soc1980 = soc1980
    if (noc2011) xw.noc2011 = noc2011
    let soccer = new SOCcer3("3.0.4")
    let res = await soccer.code_jobs(id, title, task, xw)
    console.log(res)
    makeResultsTable(res, tableElement)
})

let allTabs = Array.from(document.querySelectorAll('[name="tab1"]'));
function toggleTabs() {
    allTabs.forEach((el2) => {
        let div = document.getElementById(el2.dataset.divid)
        div.style.display = el2.checked ? 'initial' : 'none'
    })
}
toggleTabs()
allTabs.forEach((el) => el.addEventListener("change", toggleTabs));







