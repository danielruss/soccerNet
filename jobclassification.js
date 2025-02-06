import { AutoConfig, AutoModel, Pipeline, pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@latest';
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.bundle.min.mjs';

export class OccupationClassificationPipeline extends Pipeline {
    constructor(options, model_data) {
        super(options)
        this.model_data = model_data
    }

    async _call(text) {
        // text.preprocess
        let emb = await this.model_data.embedding_pipeline(text, this.model_data.config.embedding_options);
        //this.model_data.soccer_model
        console.log(emb.tolist())
    }
}

export class IndustryClassificationPipeline extends Pipeline {
    constructor(options, model_data) {
        super(options)
        this.model_data = model_data
    }
}

const SUPPORTED_TASKS = Object.freeze({
    "job-classification": OccupationClassificationPipeline,
    "industry-classification": IndustryClassificationPipeline
});

export async function soccerPipeline(task, model = null, options) {
    if (!Object.keys(SUPPORTED_TASKS).includes(task)) {
        throw Error(`Unsupported pipeline: ${task} must be one of ${Object.keys(SUPPORTED_TASKS)}`)
    }
    if (!model) {
        throw Error(`Please provide a SOCcer model`)
    }

    // load the config.json
    let config = await AutoConfig.from_pretrained(model)
    console.log(config)

    // load the onnx model
    let soccer_model = await AutoModel.from_pretrained(model, { quantized: false })
    console.log(soccer_model)

    // load the embedding_pipeline...
    let embedding_pipeline = await pipeline('feature-extraction',
        config.embedding_model, config.embedding_pipeline_options)
    let x = await embedding_pipeline(["hi there", "hi there"], config.embedding_options)
    console.log(x.tolist())

    let model_parts = await load_json(task)
    model_parts.soccer_model = soccer_model
    model_parts.embedding_pipeline = embedding_pipeline;
    model_parts.config = config;
    console.log("task-data: ", model_parts)

    let pipe = new SUPPORTED_TASKS[task]({}, model_parts)
    return pipe
}

async function load_json(task) {
    let obj = {};
    if (task == "job-classification") {
        let abbrev = await (await fetch("./data/abbrev.json")).json()
        let isco1988 = await (await fetch("./data/isco1988_soc2010.json")).json()
        let noc2011 = await (await fetch("./data/noc2011_soc2010_via_soc2018.json")).json()
        let soc1980 = await (await fetch("./data/soc1980_soc2010.json")).json()

        obj = {
            abbrev: abbrev,
            known_crosswalks: {
                isco1988: isco1988,
                noc2011: noc2011,
                soc1980: soc1980
            }
        }
    } else {
        // right now nothing, but need to add the known crosswalks...
        obj = {
            abbrev: {},
            known_crosswalks: {}
        }
    }
    return obj;
}
window.soccerPipeline = soccerPipeline