export const soc2010_6digit = (await (await fetch("https://danielruss.github.io/codingsystems/soc2010_6digit.json")).json())
    .filter(x => x.soc_code != "99-9999")

export const naics2022_5digit = (await (await fetch("https://danielruss.github.io/codingsystems/naics2022_all.json")).json())
    .filter(x => x.Level == 5 && x.naics2d != 99)

export const soc2010_info = new Map()
soc2010_6digit.forEach((code, index) => soc2010_info.set(code.soc_code, {
    code: code.soc_code,
    title: code.title,
    index: index
}))

export const naics2022_info = new Map()
naics2022_5digit.forEach((code, index) => naics2022_info.set(code.code, {
    code: code.soc,
    title: code.title,
    index: index
}))