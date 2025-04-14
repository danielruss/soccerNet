import mocha from 'https://cdn.jsdelivr.net/npm/mocha@10.7.3/+esm'
import { assert } from 'https://cdn.jsdelivr.net/npm/chai@5.1.1/+esm'
import { CodingSystem, Crosswalk } from '../crosswalk2.js'

mocha.setup('bdd');
describe('Codingsystem Test', () => {
    it('should know the soc2010 coding system', async () => {
        let soc2010 = await CodingSystem.loadCodingSystem('soc2010')
        assert.isNotNull(soc2010, 'soc2010 should not be null');
        assert.isObject(soc2010,"soc2010 should be an Object")
        assert.isArray(soc2010.codes, "soc2010 codes should be an array")
        assert.lengthOf(soc2010.codes,840, 'soc2010 should have 840 6-digit soc codes')
        assert.lengthOf(soc2010.codeMap, 840,'soc2010 lookup map should have 840 entries')
        assert.equal(soc2010.codeMap.get("11-2022"),5,"soc 11-2022 should have index=5")
        assert.equal(soc2010.numberOfCodes,840,'soc2010 should have 840 6-digit soc codes')
        window.soc2010=soc2010
        assert.equal(soc2010.isCached(),true)
    })

    it('should know the naics2022 coding system', async () => {
        let naics2022 = await CodingSystem.loadCodingSystem('naics2022')
        window.naics2022=naics2022;
        assert.isNotNull(naics2022, 'naics2022 should not be null');
        assert.isObject(naics2022, "naics2022 should be an array")
        assert.isArray(naics2022.codes, "naics2022 should be an array")
        assert.lengthOf(naics2022.codes,689, 'naics2022 should have 689 5-digit codes')
        assert.lengthOf(naics2022.codes,689, 'naics2022 lookup map should have 689 entries')
        assert.equal(naics2022.codeMap.get("11133"),10,"naics 11133 should have index=10")
        assert.equal(naics2022.numberOfCodes,689,'naics should have 689 5-digit soc codes')
    })

    it('should throw an error if I try to load an unknown coding system', async () => {
        try {
            let naics2021 = await CodingSystem.loadCodingSystem('naics2021')
            assert.fail("Should not have founssd a naics 2021 coding system!!")            
        } catch (error) {
            // this is the happy path...
        }
    })

    it('should be able to multihot encode', async () =>{
        let naics2022 = await CodingSystem.loadCodingSystem('naics2022');
        // this is Citrus (except Orange) Groves:9 and
        // Port and Harbor Operation:407
        let z = naics2022.multiHotEncode([["11132","48831"]])
        assert.equal(z.buffer[9],1)
        assert.equal(z.buffer[407],1)
        assert.equal(z.buffer.reduce((acc,cv)=>acc+cv,0),2)
        assert.isArray(z.dim)
        assert.lengthOf(z.dim,2)
        assert.deepEqual(z.dim,[1,689])

        z = naics2022.multiHotEncode([["11132"],["48831"]])
        assert.equal(z.buffer[9],1)
        assert.equal(z.buffer[689+407],1)
        assert.equal(z.buffer.reduce((acc,cv)=>acc+cv,0),2)
        assert.isArray(z.dim)
        assert.lengthOf(z.dim,2)
        assert.deepEqual(z.dim,[2,689])

        z = naics2022.multiHotEncode([["11111","11112"],["11119","11121","11131"]])
        assert.equal(z.buffer[0],1)
        assert.equal(z.buffer[1],1)
        assert.equal(z.buffer[689+6],1)
        assert.equal(z.buffer[689+7],1)
        assert.equal(z.buffer[689+8],1)
        assert.equal(z.buffer.reduce((acc,cv)=>acc+cv,0),5)
    })
})

describe("Crosswalk Tests",()=>{
    it('should crosswalk from sic1987 -> naics2022',async () =>{
        let sic1987_naics2022 = await Crosswalk.loadCrosswalk("sic1987","naics2022")
        assert.isNotNull(sic1987_naics2022)
        assert.equal(sic1987_naics2022.from,"sic1987")
        assert.equal(sic1987_naics2022.to,"naics2022")
        assert.equal(sic1987_naics2022.isCached(),true)
        window.sic1987_naics2022=sic1987_naics2022;
        
        let x = sic1987_naics2022.crosswalkCodes( ["0111","0112"] )
        assert.lengthOf(x,2)
        assert.include(x,"11114","does not contain 11114")
        assert.include(x,"11116","does not contain 11116")

        x = sic1987_naics2022.crosswalkCodes( ["0119","0112"] )
        assert.lengthOf(x,5)
        assert.include(x,"11112","does not contain 11112")
        assert.include(x,"11113","does not contain 11113")
        assert.include(x,"11115","does not contain 11115")
        assert.include(x,"11116","does not contain 11116")
        assert.include(x,"11119","does not contain 11119")
    })
})
mocha.run();