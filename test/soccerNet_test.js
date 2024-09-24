import mocha from 'https://cdn.jsdelivr.net/npm/mocha@10.7.3/+esm'
import { assert } from 'https://cdn.jsdelivr.net/npm/chai@5.1.1/+esm'
import { crosswalk } from '../crosswalk.js'
import { SOCcer3 } from '../soccer3_onnx.mjs'

// we need to correct the url when we use unit testing...
SOCcer3.version_info.set(
    "3.0.5-ut", {
    "soccer_url": "../SOCcer_v3.0.5.onnx",
    "embedding_model_name": 'Xenova/GIST-small-Embedding-v0',
    "version": "3.0.5",
    "pooling": "cls"
})

mocha.setup('bdd');
describe('Crosswaking', () => {
    it('should crosswalk a single 1=>1', async function () {
        let res1 = await crosswalk({ "soc2018": "11-1011" })
        assert.isOk(res1, "11-1011 is not ok")
        assert.equal(res1.data[0], 1, "Did not xw to 11-1011")
        assert.equal(res1.data.reduce((acc, val) => acc + val, 0), 1, "crosswalked to more than just 11-1011")
    })
    it('should crosswalk a single many=>1', async function () {
        // you must use a 2d-array or it will think 2 jobs...
        let res1 = await crosswalk({ "noc2011": [["0012", "0013"]] })
        assert.isOk(res1, '[["0012","0013"]] is not ok')
        assert.equal(res1.data[0], 1, "Did not xw to 11-1011")
        assert.equal(res1.data.reduce((acc, val) => acc + val, 0), 1, "crosswalked to more than just 11-1011")
    })
    it('should crosswalk a single 1=>many', async function () {
        let res1 = await crosswalk({ "noc2011": "0114" })
        assert.isOk(res1, '"0014" is not ok')
        assert.equal(res1.data[7], 1, "Did not xw to 11-3011")
        assert.equal(res1.data[27], 1, "Did not xw to 11-9111")
        assert.equal(res1.data.reduce((acc, val) => acc + val, 0), 2, "crosswalked to more than just 11-3011 and 11-9111")
    })

    it('should crosswalk multiple jobs', async function () {
        let res1 = await crosswalk({ "soc1980": [["127"], ["1281"]] })
        window.res1 = res1
        assert.isOk(res1, '"0014" is not ok')
        assert.equal(res1.data[6], 1, "soc1980 127 did not xw to 11-2031")
        assert.equal(res1.data[31], 1, "soc1980 127 did not xw to 11-9151")
        assert.equal(res1.data[840 + 20], 1, "soc1980 1281 did not xw to 11-9033")
        assert.equal(res1.data[840 + 33], 1, "soc1980 1281 did not xw to 11-9199")
        assert.equal(res1.data.reduce((acc, val) => acc + val, 0), 4, "the two jobs crosswalked to more than 4 codes")
    })
    it('should crosswalk multiple coding system', async function () {
        let res1 = await crosswalk({ "soc1980": [["127"], ["1281"]], "noc2011": [["0423"], []] })
        window.res1 = res1
        let nxw = res1.data.reduce((acc, val) => acc + val, 0)
        assert.isOk(res1, '"0014" is not ok')
        assert.equal(res1.data[6], 1, "soc1980 127 did not xw to 11-2031")
        assert.equal(res1.data[18], 1, "noc2011 0423 did not xw to 11-9031")
        assert.equal(res1.data[31], 1, "soc1980 127/noc2011 0423 did not xw to 11-9151")
        assert.equal(res1.data[179], 1, "noc2011 0423 did not xw to 21-2021")
        assert.equal(res1.data[840 + 20], 1, "soc1980 1281 did not xw to 11-9033")
        assert.equal(res1.data[840 + 33], 1, "soc1980 1281 did not xw to 11-9199")
        assert.equal(nxw, 6, "the two jobs crosswalked to more than 6 codes")
    })
})

describe('Coding Jobs compared with Python', async () => {

    const soccerNet = new SOCcer3("3.0.5-ut")
    it('should code a load officer as 13-2072 with score 0.98197734 wo/XW', async function () {
        let res = await soccerNet.code_jobs(["j1"], ["loan officer"], [""], {}, 2)
        assert.equal(res[0].soc2010[0], "13-2072")
        assert.closeTo(res[0].score[0], 0.98197734, 0.0001, "The score is not close enough to the python value.")
    })
    it('should code a load officer as 13-2072 with score 0.9959886 w/XW', async function () {
        let res = await soccerNet.code_jobs(["j1"], ["loan officer"], [""], { soc1980: [["1415"]] }, 2)
        assert.equal(res[0].soc2010[0], "13-2072")
        assert.closeTo(res[0].score[0], 0.9959886, 0.0001, "The score is not close enough to the python value.")
    })
})


mocha.run();