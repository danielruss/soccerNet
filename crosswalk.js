import { soc2010_info } from './common.js';
import localforage from 'https://cdn.jsdelivr.net/npm/localforage@1.10.0/+esm'

const calcIndex = (row, col) => row * 840 + col
const knownCrosswalks = new Map([
    ["soc1980", "https://danielruss.github.io/codingsystems/soc1980_soc2010.json"],
    ["noc2011", "https://danielruss.github.io/codingsystems/noc2011_soc2010_via_soc2018.json"],
    ["isco1988", "https://danielruss.github.io/codingsystems/isco1988_soc2010.json"],
    ["sic1987", "https://danielruss.github.io/codingsystems/sic1987_naics2022.json"]
])
export const availableCodingSystems = Array.from(knownCrosswalks.keys());

const crosswalk_cache = localforage.createInstance({
    name: "soccer3_cache",
    storeName: "crosswalks"
})

async function buildCrossWalk(url, system) {
    if (!await crosswalk_cache.getItem(system)) {
        const raw = await (await fetch(url)).json()
        const xw = raw.reduce((acc, current) => {
            if (!acc.has(current[system])) {
                acc.set(current[system], [])
            }
            acc.get(current[system]).push(current['soc2010'])
            return acc;
        }, new Map())
        crosswalk_cache.setItem(system, xw)
        return xw
    }
    return crosswalk_cache.getItem(system)
}

const promises = [...knownCrosswalks.entries()].map(([system, url]) => buildCrossWalk(url, system));
await Promise.all(promises)


export async function crosswalk(data, crosswalk_buffer) {

    for (let variable of Object.entries(data)) {
        let [key, value] = variable
        if (knownCrosswalks.has(key)) {
            console.log(`crosswalking from ${key}`)
            await crosswalk_from(key, value, crosswalk_buffer)
        }

    }
    return crosswalk_buffer;
}

async function crosswalk_from(system, codes, buffer) {

    // this inner function crosswalks 1 code to 
    // a multi-hot encoding.  xw is the crosswalk
    // code is the code we are crosswalking to soc2010
    // index is the id of the job.
    // WARNING: we now have sic->naics xw
    // need to be careful here.
    function xw_one(xw, code, index, buffer) {
        let soc2010_codes = xw.get(code)
        if (!soc2010_codes) return
        soc2010_codes.forEach(soc_code => {
            let info = soc2010_info.get(soc_code)
            let buffer_index = calcIndex(index, info.index)
            buffer.data[buffer_index] = 1.
        })
        return buffer
    }

    if (!knownCrosswalks.has(system)) throw new Error(`Unknow coding system: ${system}`)
    const xw = await buildCrossWalk(knownCrosswalks.get(system), system);
    if (!Array.isArray(codes)) codes = [codes]


    // for each job. cross walk the other code.
    // if there are multiple codes for a job, get all the codes.
    codes.map((code, index) => {
        if (Array.isArray(code)) {
            code.forEach(cd => xw_one(xw, cd, index, buffer))
        } else {
            xw_one(xw, code, index, buffer)
        }
    })
    return buffer
}