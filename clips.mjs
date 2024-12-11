import { getEmbbedder, embed_text_only } from './embed.js';
import { onnxResultToArray } from './soccer3_onnx.mjs';
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.bundle.min.mjs';

export const naics2022 = (await (await fetch("https://danielruss.github.io/codingsystems/naics2022_all.json")).json())
console.log(naics2022)

export class clips {
    static version_info = new Map(Object.entries({
        "0.0.1": {
            "clips_url": "https://danielruss.github.io/soccerNet/clips_0.0.1.onnx",
            "embedding_model_name": 'Xenova/GIST-small-Embedding-v0',
            "version": "3.0.5",
            "pooling": "cls",
            "train_data": "industry_training_data1.json"
        }
    }))

    constructor(version) {
        if (!clips.version_info.has(version)) {
            throw new Error(`Unknown version ${version}: allowed values ${[...clips.version_info.keys()]}`)
        }
        this.version = clips.version_info.get(version);
        this.ready = false;
        this.embedder = null;

        console.log(`Loading CLIPS from: ${this.version.clips_url}`)
        let session_promise = ort.InferenceSession.create(this.version.clips_url, { executionProviders: ['webgpu'] });
        let embedder_promise = getEmbbedder(this.version)

        this.ready_promise = Promise.all([session_promise, embedder_promise])
        this.ready_promise.then(([session, embedder]) => {
            this.embedder = embedder;
            this.session = session;
            this.ready = true;
        })
    }

    async wait_until_ready() {
        if (!this.ready) {
            await this.ready_promise;
        }
    }

    async code_industry(ids, products_and_services, crosswalk_info = null, k = 10) {
        await this.wait_until_ready();

        let embeddings = await embed_text_only(products_and_services, this.embedder, this.version.pooling);
        const embeddings_tensor = new ort.Tensor('float32', embeddings.data, embeddings.dims);

        // currently there is no crosswalk info...

        const feeds = {
            embedded_input: embeddings_tensor,
        }
        let results = await this.session.run(feeds);
        results = results.map((row) => topK(row, k))
        return results
    }
}

console.log("clips 0.0.1")
let c1 = new clips("0.0.1")

