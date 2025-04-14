import { soc2010_6digit, soc2010_info } from './common.js';


const baseURL="https://danielruss.github.io/codingsystems"
const knownCodingSystemInfo = new Map([
    ["soc2010",{url:`${baseURL}/soc2010_all.json`,level:6,filter:{key:"soc2d",value:"99-0000"}}],
    ["naics2022",{url:`${baseURL}/naics2022_all.json`,level:5,filter:{key:"naics2d",value:"99"}}]
])


const knownCrosswalkURLs = new Map([
    ["soc2010", new Map([
        ["soc1980", "https://danielruss.github.io/codingsystems/soc1980_soc2010.json"],
        ["noc2011", "https://danielruss.github.io/codingsystems/noc2011_soc2010_via_soc2018.json"],
        ["isco1988", "https://danielruss.github.io/codingsystems/isco1988_soc2010.json"]
    ])],
    ["naics2022", new Map([
        ["sic1987", "https://danielruss.github.io/codingsystems/sic1987_naics2022_5d.json"]
    ])]
])


export class CodingSystem{
    static cachedCodingSystems = new Map();

    static async loadCodingSystem(system){
        if (CodingSystem.cachedCodingSystems.has(system)) {
            return CodingSystem.cachedCodingSystems.get(system)
        }
        if (!knownCodingSystemInfo.has(system)) {
            throw new Error(`Unknown coding system: ${system} `)
        }
        let info = knownCodingSystemInfo.get(system)
        let codes  = await (await fetch(info.url)).json()
        codes = codes.filter((code)=> (code.Level == info.level) && (code[info.filter.key] != info.filter.value) )
        let codeMap = codes.reduce( (acc,code,indx)=>{
            acc.set(code.code,indx)
            return acc
        },new Map() )

        let codingSystem = new CodingSystem(codes,codeMap,system,codes.length);
        CodingSystem.cachedCodingSystems.set(system,codingSystem)

        return codingSystem
    }

    constructor(codes,codeMap,name,numberOfCodes){
        this.codes=codes;
        this.codeMap=codeMap;
        this.name=name;
        this.numberOfCodes=numberOfCodes
    }

    isCached() {
        return CodingSystem.cachedCodingSystems.has(this.name)
    }

    toIndices(codes){
        const result = [];
        for (let item of codes){
            if (Array.isArray(item)){
                result.push(this.toIndices(item))
            } else{
                result.push(this.codeMap.get(item))
            }
        }
        return result
    }

    calcIndex(row, col){
        return row * this.numberOfCodes + col
    }

    // i have to pass in the buffer because I may
    // crosswalk from multiple coding systems. (I think.)
    multiHotEncode(buffer,codes){
        let indices=this.toIndices(codes);
        for (let row=0;row<indices.length;row++){
            for (let col=0;col<indices[row].length;col++){
                buffer[this.calcIndex(row,indices[row][col])] = 1;
            }
        }
        return {
            buffer,
            dim: [codes.length,this.numberOfCodes]
        }
    }
}

export class Crosswalk {
    static cachedCrosswalks = new Map();
    
    static async loadCrosswalk(from,to){
        if (Crosswalk.cachedCrosswalks.has(`${from}->${to}`)){
            return Crosswalk.cachedCrosswalks.get(`${from}->${to}`);
        }
        
        if (!knownCrosswalkURLs.has(to)) {
            throw new Error(`No Crosswalks to ${to} `)
        }
        let toMap = knownCrosswalkURLs.get(to)
        if (!toMap.has(from)) {
            throw new Error(`No Crosswalks from ${from} to ${to} `)
        }
        let url = toMap.get(from);
        let xw_data  = await (await fetch(url)).json()
        let crosswalk = xw_data.reduce( (acc,cv) => {
            if (!acc.has(cv[from].toString())) {
                acc.set(cv[from].toString(),[])
            }
            acc.get(cv[from].toString()).push(cv[to].toString())
            return acc
        },new Map() )

        let xw = new Crosswalk(crosswalk,from,to)
        Crosswalk.cachedCrosswalks.set(`${xw.from}->${xw.to}`,xw)
        return xw;
    }

    constructor(xw,from,to){
        this.crosswalk=xw;
        this.from=from;
        this.to=to;
    }

    isCached() {
        return Crosswalk.cachedCrosswalks.has(`${this.from}->${this.to}`)
    }

    crosswalkCodes(codes) {
        if (!Array.isArray(codes)){
            codes = [codes]
        }
        let res = codes.reduce( (acc,pv)=> {
                acc.push(this.crosswalk.get(pv.toString()))
                return acc.flat();
            },[])
        res=Array.from( new Set(res) ).sort()
        return res;
    }
}