export const soc2010 = (await (await fetch("https://danielruss.github.io/codingsystems/soc2010_6digit.json")).json())
    .filter(x => x.soc_code != "99-9999")
export const naics2022 = (await (await fetch("https://danielruss.github.io/codingsystems/naics2022_all.json")).json())
    .filter((naics_code) => naics_code.Level == 5 && naics_code.naics2d != "99")

console.log(naics2022)
console.log(soc2010)