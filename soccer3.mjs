
import { embed_text, getEmbbedder } from './embed.js';
import { crosswalk } from './crosswalk.js';
import { abbrev } from './abbrev.js';
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.bundle.min.mjs';
import { naics2022_5digit, soc2010_6digit as soc2010, soc2010_6digit } from './common.js'

let SOCcerNET = {
    name: "SOCcerNET",
    abbrev: Object.entries(abbrev).reduce((acc, cv) => {
        let [k, v] = cv;
        if (!Array.isArray(v)) {
            acc[k] = v
        }
        return acc
    }, {}),
    code: async function (args) {
        let { data, n, embedder, pooling, session } = args
        data = this.preprocess(data);
        let embeddings = await embed_text(data.JobTitleTask, embedder, pooling)
        const embeddings_tensor = new ort.Tensor('float32', embeddings.data, embeddings.dims);

        // crosswalk the crosswalk info... default is all zeros...
        let crosswalks = {
            data: new Float32Array(embeddings.dims[0] * 840),
            dims: [embeddings.dims[0], 840]
        }
        crosswalks = await crosswalk(data, crosswalks)
        const crosswalk_tensor = new ort.Tensor('float32', crosswalks.data, crosswalks.dims);
        const feeds = {
            embedded_input: embeddings_tensor,
            crosswalked_inp: crosswalk_tensor
        }


        let results = await session.run(feeds);
        // convert to a 2d-array
        results = onnxResultToArray(results.soc2010_out)
        // get the top k-results...
        results = results.map((row) => this.topK(row, n))

        return results
    },
    preprocess: function (args) {
        preprocess_handle_na(args, "JobTitle")
        preprocess_handle_na(args, "JobTask")
        if (args.JobTitle.length != args.JobTask.length) throw new Error("#Job title != #Job task")
        args.JobTitle = args.JobTitle.map(txt => preprocess_clean_text(txt))
        args.JobTask = args.JobTask.map(txt => preprocess_clean_text(txt))

        // handle abbreviations...
        args.JobTitle = args.JobTitle.map(txt => Object.hasOwn(this.abbrev, txt) ? this.abbrev[txt] : txt)
        args.JobTask = args.JobTask.map(txt => Object.hasOwn(this.abbrev, txt) ? this.abbrev[txt] : txt)

        // combine the job title and job task
        args.JobTitleTask = args.JobTitle.map((_, indx) => `${args.JobTitle[indx]} ${args.JobTask[indx]}`.trim());
        return args
    },
    topK: function (arr, k) {
        // Set k to the length of the array if k is greater than the array length
        k = Math.min(k, arr.length);

        // Create an array of indices and sort it based on the values in arr
        const indices = Array.from(arr.keys()).sort((a, b) => arr[b] - arr[a]);

        // Get the top k values and their indices
        const topValues = indices.slice(0, k).map(i => arr[i]);
        const topIndices = indices.slice(0, k);
        const topLabels = topIndices.map(i => soc2010_6digit[i].title)
        const topCodes = topIndices.map(i => soc2010_6digit[i].soc_code)

        return { soc2010: topCodes, title: topLabels, score: topValues };
    }
}

let CLIPS = {
    name: "CLIPS",
    code: async function (args) {
        let { data, n, embedder, pooling, session } = args
        data = this.preprocess(data);
        let embeddings = await embed_text(data.products_services, embedder, pooling)
        const embeddings_tensor = new ort.Tensor('float32', embeddings.data, embeddings.dims);
        const feeds = {
            embedded_input: embeddings_tensor,
        }
        let results = await session.run(feeds);
        // convert to a 2d-array
        results = onnxResultToArray(results.naics2022_5_out)
        // get the top k-results...
        results = results.map((row) => this.topK(row, n))

        return results
    },
    preprocess: function (data) {
        return data
    },
    topK: function (arr, k) {
        // Set k to the length of the array if k is greater than the array length
        k = Math.min(k, arr.length);

        // Create an array of indices and sort it based on the values in arr
        const indices = Array.from(arr.keys()).sort((a, b) => arr[b] - arr[a]);

        // Get the top k values and their indices
        const topValues = indices.slice(0, k).map(i => arr[i]);
        const topIndices = indices.slice(0, k);
        const topLabels = topIndices.map(i => naics2022_5digit[i].title)
        const topCodes = topIndices.map(i => naics2022_5digit[i].code)

        return { naics2022: topCodes, title: topLabels, score: topValues };
    }
}

export default class SOCcer {

    static version_info = new Map(Object.entries({
        "SOCcerNET 0.0.1": {
            "type": "SOCcerNET",
            "soccer_url": "https://danielruss.github.io/soccerNet/SOCcer_v3.0.5.onnx",
            "embedding_model_name": 'Xenova/GIST-small-Embedding-v0',
            "pooling": "cls",
            "version": "SOCcerNET 0.0.1",
            "soccerVersion": "3.0.5",
            "soccerNetVersion": "0.0.1",
            "train_data": "May2024",
            "coder": SOCcerNET,
        },
        "SOCcerNET 0.0.2": {
            "type": "SOCcerNET",
            "soccer_url": "https://danielruss.github.io/soccerNet/SOCcer_v3.0.6.onnx",
            "embedding_model_name": 'Xenova/GIST-small-Embedding-v0',
            "pooling": "cls",
            "version": "SOCcerNET 0.0.2",
            "soccerVersion": "3.0.6",
            "soccerNetVersion": "0.0.2",
            "train_data": "Oct2024",
            "coder": SOCcerNET,
            "required_columns": ["JobTitle", "JobTask"],
        },
        "SOCcerNET 0.0.3.Jan27": {
            "type": "SOCcerNET",
            "soccer_url": "https://danielruss.github.io/soccerNet/s3_jan27.onnx",
            "embedding_model_name": 'Xenova/GIST-small-Embedding-v0',
            "pooling": "cls",
            "version": "SOCcerNET 0.0.3.Jan27",
            "soccerVersion": "3.0.7.Jan27",
            "soccerNetVersion": "0.0.3.Jan27",
            "train_data": "Oct2024",
            "coder": SOCcerNET,
            "required_columns": ["JobTitle", "JobTask"],
        },
        "CLIPS 0.0.1": {
            "type": "CLIPS",
            "soccer_url": "./clips_0.0.1.onnx",
            "embedding_model_name": 'Xenova/GIST-small-Embedding-v0',
            "version": "CLIPS 0.0.1",
            "clipsVersion": "0.0.1",
            "pooling": "cls",
            "train_data": "industry_training_data1.json",
            "coder": CLIPS,
            "required_columns": ["products_services"],
        },
    }))

    constructor(version) {
        if (!SOCcer.version_info.has(version)) {
            throw new Error(`Unknown version ${version}: allowed values ${[...SOCcer.version_info.keys()]}`)
        }
        this.version = SOCcer.version_info.get(version);
        this.ready = false;
        this.embedder = null;

        console.log(`Loading SOCcer from: ${this.version.soccer_url}`)
        let session_promise = ort.InferenceSession.create(this.version.soccer_url, { executionProviders: ['webgpu'] });
        let embedder_promise = getEmbbedder(this.version)

        this.ready_promise = Promise.all([session_promise, embedder_promise])
        this.ready_promise.then(([session, embedder]) => {
            this.embedder = embedder;
            this.session = session;
            this.ready = true;
        })

        this.coder = this.version.coder
    }

    async wait_until_ready() {
        if (!this.ready) {
            await this.ready_promise;
        }
    }

    async code_chunk(data, n) {
        console.log(" ============= ", this.version.type, this.coder)
        return this.coder.code({
            data: data,
            n: n,
            embedder: this.embedder,
            pooling: this.version.pooling,
            session: this.session,
        });
    }
}

function onnxResultToArray(tensor) {
    const [rows, cols] = tensor.dims;
    const data = Array.from(tensor.cpuData);

    return Array.from({ length: rows }, (_, i) => data.slice(i * cols, i * cols + cols));
}


function preprocess_handle_na(args, key) {
    args[key] ??= " ";
    if (!Array.isArray(args[key])) {
        args[key] = [args[key]]
    }

}
function preprocess_clean_text(txt) {
    return txt.replaceAll(/^[\s\-\.]+|[\s\-\.]+$/g, "").toLowerCase()
}
