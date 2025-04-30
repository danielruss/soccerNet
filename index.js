console.log("... in index.js ...")
import SOCcer from './soccer3.mjs'
import { download_ofps_file } from './io.js';

let soccerNet = null;
const versionSetup = async (defaultVersion) => {
    let selectElement = document.getElementById("versionSelectElement")

    let soccerNetElement = document.createElement("optgroup")
    soccerNetElement.label = "SOCcerNET"
    selectElement.insertAdjacentElement("beforeend", soccerNetElement)

    let clipsElement = document.createElement("optgroup")
    clipsElement.label = "CLIPS"
    selectElement.insertAdjacentElement("beforeend", clipsElement)

    SOCcer.version_info.entries().forEach(([key, value]) => {
        let el = document.createElement("option")
        el.value = key;
        el.innerText = key
        el.selected = key == defaultVersion
        el.dataset.type = value.type
        el.dataset.value = key
        let optgroup = (value.type == "SOCcerNET") ? soccerNetElement : clipsElement;
        optgroup.insertAdjacentElement("beforeend", el)
    });


    selectElement.addEventListener("change", async (event) => {
        let selectedElement = selectElement.options[selectElement.selectedIndex];
        soccerNet = new SOCcer(selectElement.value)

        console.time(`Loaded ${selectElement.value} in`)
        await soccerNet.wait_until_ready()
        console.timeEnd(`Loaded ${selectElement.value} in`)

        let indElement = document.querySelectorAll('[data-type="industry"]');
        let occElement = document.querySelectorAll('[data-type="occupation"]');
        console.log(indElement, occElement)
        if (selectedElement.dataset.type == "SOCcerNET") {
            console.log("... in soccernet ", selectedElement.dataset.type)
            indElement.forEach(e => e.classList.add("hidden"))
            occElement.forEach(e => e.classList.remove("hidden"))

        } else {
            console.log("... in NOT soccernet ", selectedElement.dataset.type)
            occElement.forEach(e => e.classList.add("hidden"))
            indElement.forEach(e => e.classList.remove("hidden"))
        }
    })

    if (!SOCcer.version_info.has(defaultVersion)) {
        console.log(`... selecting ${selectElement.lastElementChild.value} by default`);
        selectElement.lastElementChild.selected = true;
    }

    console.log(selectElement.value)
    soccerNet = new SOCcer(selectElement.value)
    await soccerNet.wait_until_ready()
}
await versionSetup("SOCcerNET 1.0.0")



// UI components
const progressbar = document.getElementById("codingProgress")
const percent = document.getElementById("pctSpan")
const fileRunButton = document.getElementById("codeJobs")
const fileButton = document.getElementById("jobfile")
const errorSpan = document.getElementById("ErrorSpan")


const worker = new Worker('soccerWorker.js', { type: 'module' });
worker.onmessage = function (e) {
    switch (e.data.type) {
        case "parse_complete":
            download_ofps_file(e.data.fileHandle, e.data.metadata);
            readyToRun();
            setTimeout(() => updateProgressBar(0, 100), 2000)
            break;
        case "update":
            updateProgressBar(e.data.completed, e.data.total)
            break
        case "error":
            console.error(e.data.message);
            errorSpan.innerText = e.data.message;
            setTimeout(() => errorSpan.innerText = "", 10000)
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



function buildTable1(res, key) {
    res = res[0]
    let tableElement = document.getElementById("res_table")
    tableElement.innerHTML = ""
    let theadElement = tableElement.createTHead()
    let tr = theadElement.insertRow()
    let cell = tr.insertCell(); cell.outerHTML = "<th>Rank</th>"
    cell = tr.insertCell(); cell.outerHTML = `<th>${key} code</th>`
    cell = tr.insertCell(); cell.outerHTML = `<th>${key} title</th>`
    cell = tr.insertCell(); cell.outerHTML = "<th>score</th>"
    let tbodyElement = tableElement.createTBody()
    for (let indx = 0; indx < res.score.length; indx++) {
        tr = tbodyElement.insertRow()
        cell = tr.insertCell(); cell.innerText = indx + 1
        cell = tr.insertCell(); cell.innerText = res[key][indx]
        cell = tr.insertCell(); cell.innerText = res.title[indx]
        cell = tr.insertCell(); cell.innerText = res.score[indx].toFixed(4)
    }
}


async function code_one_job(event) {
    let button = document.getElementById("code1Job")

    button.disabled = true;
    let k = parseInt(document.getElementById("n1").value);
    k = k || 10;

    let chunk = {}
    let res = {}
    switch (soccerNet.version.type) {
        case "CLIPS":
            let ps = document.getElementById("oneProduct").value;
            let sic1987 = document.getElementById("oneSic1987").value;
            if (ps.trim().length == 0) {
                button.disabled = false;
                return
            }
            chunk = {
                Id: ["id"],
                products_services: [ps],
            };
            if (soccerNet.version.clipsVersion != "0.0.1" && sic1987.length>0){
                chunk.sic1987 = [sic1987];
            }
            res = await soccerNet.code_chunk(chunk, k)
            buildTable1(res, "naics2022")
            break;
        case "SOCcerNET":
            let jobTitle = document.getElementById("oneTitle").value;
            let jobTask = document.getElementById("oneTask").value;
            let soc1980 = document.getElementById("oneSoc1980").value;
            let noc2011 = document.getElementById("oneNoc2011").value;

            if (jobTitle.trim().length + jobTitle.trim().length == 0) {
                button.disabled = false;
                return
            }
            chunk = {
                id: ["id"],
                JobTitle: [jobTitle],
                JobTask: [jobTask],
            };
            if (soc1980.length > 0) {
                chunk.soc1980 = [soc1980]
            }
            if (noc2011.length > 0) {
                chunk.noc2011 = [noc2011]
            }

            console.log(chunk, k)
            res = await soccerNet.code_chunk(chunk, k)
            console.log(res)
            buildTable1(res, "soc2010")
            break
    }





    button.disabled = false;
}
document.getElementById("code1Job").addEventListener("click", code_one_job);

function code_file() {
    console.log(".... code file")
    fileRunButton.disabled = true;
    fileButton.disabled = true;
    document.body.style.cursor = 'progress';

    const file_list = document.getElementById("jobfile").files
    const n = document.getElementById("n").value || 10;
    if (file_list.length > 0) {
        worker.postMessage({ type: "code_file", file: file_list[0], version: soccerNet.version.version, n: n })
        //parse_file(file_list[0], soccerNet, n)
        readyToRun()
    } else {
        readyToRun()
    }

}

fileRunButton.addEventListener("click", code_file);

