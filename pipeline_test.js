import { soccerPipeline } from "./jobclassification.js";
import * as tjs from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.2'
window.tjs = tjs

function isLocalhost() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

let out = document.getElementById("out")
out.innerHTML = `Am I running on localhost: ${isLocalhost()} <br>`

let soccer = await soccerPipeline("job-classification", "danielruss/SOCcer3_jan27");
out.insertAdjacentHTML('beforeend', `got the soccerPipeline ${soccer != null}<br>`)
