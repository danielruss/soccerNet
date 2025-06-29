import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@latest';
import { abbrev } from './abbrev.js'


export async function getEmbbedder(info) {
    let embedder = pipeline('feature-extraction', info.embedding_model_name, { quantized: false })
    return embedder
}

export async function embed_text(text, embedder, pooling) {
    let emb_obj = await embedder(text, {
        pooling: pooling,
        normalize: true,
    })
    return emb_obj;
}

// To Do: this should not preprocess text.. Just embed...
export async function old_embed_text(id, JobTitle, JobTask, embedder, pooling) {
    let res = preprocess({ id: id, JobTitle: JobTitle, JobTask: JobTask })
    let emb_obj = await embedder(res.JobTitleTask, {
        pooling: pooling,
        normalize: true,
    })
    return emb_obj;
}

// To Do: move this to the soccer worker or soccer.mjs ...
function preprocess(args) {
    // handle NA/NaN/empty arguments
    args.JobTitle ??= " ";
    if (!Array.isArray(args.JobTitle)) {
        args.JobTitle = [args.JobTitle]
    }

    args.JobTask ??= " ";
    if (!Array.isArray(args.JobTask)) {
        args.JobTask = [args.JobTask]
    }
    if (args.JobTitle.length != args.JobTask.length) throw new Error("#Job title != #Job task")

    // clean the JobTitle/JobTask...
    function clean(txt) {
        return txt.replaceAll(/^[\s\-\.]+|[\s\-\.]+$/g, "").toLowerCase()
    }
    args.JobTitle = args.JobTitle.map(txt => clean(txt))
    args.JobTask = args.JobTask.map(txt => clean(txt))

    // handle abbreviations...
    args.JobTitle = args.JobTitle.map(txt => Object.hasOwn(abbrev, txt)? abbrev[txt] : txt)
    args.JobTask = args.JobTask.map(txt => Object.hasOwn(abbrev, txt) ? abbrev[txt] : txt)

    // combine the job title and job task
    args.JobTitleTask = args.JobTitle.map((_, indx) => `${args.JobTitle[indx]} ${args.JobTask[indx]}`.trim());
    return args;
}