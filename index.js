console.log("... in index.js ...")
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.bundle.min.mjs';
import XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs"
import { soc2010, SOCcer3 } from './soccer3_onnx.mjs';
import { clips } from './clips.mjs';

let soccerNet = null;
const versionSetup = async (defaultVersion) => {
    let selectElement = document.getElementById("versionSelectElement")
    SOCcer3.version_info.entries().forEach(([key, value]) => {
        let el = document.createElement("option")
        el.value = key;
        el.innerText = `SOCcerNET ${value.soccerNetVersion}`
        el.selected = key == defaultVersion
        selectElement.insertAdjacentElement("beforeend", el)
    });
    selectElement.addEventListener("change", async (event) => {
        soccerNet = new SOCcer3(selectElement.value)
        await soccerNet.wait_until_ready()
    })
    if (!SOCcer3.version_info.has(defaultVersion)) {
        console.log(`... selecting ${selectElement.lastElementChild.value} by default`);
        selectElement.lastElementChild.selected = true;
    }

    console.log(selectElement.value)
    soccerNet = new SOCcer3(selectElement.value)
    await soccerNet.wait_until_ready()
}

await versionSetup()

// UI components
const progressbar = document.getElementById("codingProgress")
const percent = document.getElementById("pctSpan")
const fileRunButton = document.getElementById("codeJobs")
const fileButton = document.getElementById("jobfile")


var worker = new Worker('./soccerWorker.js', { type: 'module' });
worker.onmessage = function (e) {
    switch (e.data.type) {
        case "parse_complete":
            download_ofps_file(e.data.fileHandle, e.data.metadata);
            readyToRun();
            break;
        case "update":
            updateProgressBar(e.data.completed, e.data.total)
            break
        case "error":
            console.error(e.data.message);
            updateProgressBar(0, 100);
            readyToRun();
    }
}

function updateProgressBar(completed, total) {
    let pct = Math.round(completed / total * 10000) / 100;
    percent.innerText = `${pct}%`;
    progressbar.value = pct;
}
function readyToRun() {
    fileRunButton.disabled = false;
    fileButton.disabled = false;
    document.body.style.cursor = 'auto';
}

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
        workbook.Props.Author = `SOCcer ${metadata.soccerVersion.version}`
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
    download_opfs_file(fileHandle, metadata)
}


function buildTable1(res) {
    let tableElement = document.getElementById("res_table")
    tableElement.innerHTML = ""
    let theadElement = tableElement.createTHead()
    let tr = theadElement.insertRow()
    let cell = tr.insertCell(); cell.outerHTML = "<th>Rank</th>"
    cell = tr.insertCell(); cell.outerHTML = "<th>soc2010 code</th>"
    cell = tr.insertCell(); cell.outerHTML = "<th>soc2010 title</th>"
    cell = tr.insertCell(); cell.outerHTML = "<th>score</th>"
    let tbodyElement = tableElement.createTBody()
    for (let indx = 0; indx < res[0].score.length; indx++) {
        tr = tbodyElement.insertRow()
        cell = tr.insertCell(); cell.innerText = indx + 1
        cell = tr.insertCell(); cell.innerText = res[0].soc2010[indx]
        cell = tr.insertCell(); cell.innerText = res[0].title[indx]
        cell = tr.insertCell(); cell.innerText = res[0].score[indx].toFixed(4)
    }
}


async function code_one_job(event) {
    let button = document.getElementById("code1Job")

    button.disabled = true;
    let jobTitle = document.getElementById("oneTitle").value;
    let jobTask = document.getElementById("oneTask").value;
    let soc1980 = document.getElementById("oneSoc1980").value;
    let noc2011 = document.getElementById("oneNoc2011").value;
    let k = parseInt(document.getElementById("n1").value);
    k = k || 10;
    if (jobTitle.trim().length + jobTitle.trim().length == 0) {
        button.disabled = false;
        return
    }
    let xw_obj = {};
    if (soc1980.length > 0) {
        xw_obj.soc1980 = soc1980
    }
    if (noc2011.length > 0) {
        xw_obj.noc2011 = noc2011
    }
    console.log(jobTitle, jobTask, k, xw_obj)
    let res = await soccerNet.code_jobs("id", jobTitle, jobTask, xw_obj, k)
    console.log(res)
    buildTable1(res)
    button.disabled = false;
}
document.getElementById("code1Job").addEventListener("click", code_one_job);

function code_file() {
    fileRunButton.disabled = true;
    fileButton.disabled = true;
    document.body.style.cursor = 'progress';

    const file_list = document.getElementById("jobfile").files
    const n = document.getElementById("n").value || 10;
    if (file_list.length > 0) {
        worker.postMessage({ type: "code_file", file: file_list[0], version: soccerNet.version.version, n: n })
    } else {
        readyToRun()
    }
}

fileRunButton.addEventListener("click", code_file);

