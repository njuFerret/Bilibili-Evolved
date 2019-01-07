(() =>
{
    return (settings, resources) =>
    {
        class Danmaku
        {
            constructor(content, time, type, fontSize, color)
            {
                this.content = content;
                this.time = parseFloat(time);
                this.type = parseInt(type);
                this.fontSize = parseFloat(fontSize);
                this.color = parseInt(color);
            }
        }
        class XmlDanmaku extends Danmaku
        {
            constructor({ content, time, type, fontSize, color, timeStamp, pool, userHash, rowId })
            {
                super(content, time, type, fontSize, color);
                this.timeStamp = parseInt(timeStamp);
                this.pool = parseInt(pool);
                this.userHash = userHash;
                this.rowId = parseInt(rowId);
                this.pDataArray = [time, type, fontSize, color, timeStamp, pool, userHash, rowId];
            }
            text()
            {
                const pData = this.pDataArray.join(",");
                return `<d p="${pData}">${this.content}</d>`;
            }
            static parse(element)
            {
                const pData = element.getAttribute("p");
                const [time, type, fontSize, color, timeStamp, pool, userHash, rowId] = pData.split(",");
                const content = element.innerHTML;
                return new XmlDanmaku({ content, time, type, fontSize, color, timeStamp, pool, userHash, rowId });
            }
        }
        class XmlDanmakuDocument
        {
            constructor(xml)
            {
                this.xml = xml;
                const document = new DOMParser().parseFromString(xml, "application/xml").documentElement;
                this.danmakus = [...document.querySelectorAll("d[p]")].map(it => XmlDanmaku.parse(it));
            }
        }
        class AssDanmaku extends Danmaku
        {
            constructor({ content, time, type, fontSize, color, typeTag, colorTag, endTime })
            {
                super(content, time, type, fontSize, color);
                this.typeTag = typeTag;
                this.colorTag = colorTag;
                this.endTime = endTime;
            }
            text(fontStyles)
            {
                const styleName = fontStyles[this.fontSize].match(/Style:(.*?),/)[1].trim();
                return `Dialogue: 0,${this.time},${this.endTime},${styleName},,0,0,0,,{${this.typeTag}${this.colorTag}}${this.content}`;
            }
        }
        class AssDanmakuDocument
        {
            constructor({ danmakus, title, fontStyles, blockTypes, resolution })
            {
                this.danmakus = danmakus;
                this.title = title;
                this.fontStyles = fontStyles;
                this.blockTypes = blockTypes;
                this.resolution = resolution;
            }
            generateAss()
            {
                const meta = `
[Script Info]
; Script generated by Bilibili Evolved Danmaku Converter
; https://github.com/the1812/Bilibili-Evolved/
Title: ${this.title}
ScriptType: v4.00+
PlayResX: ${this.resolution.x}
PlayResY: ${this.resolution.y}
Timer: 10.0000
WrapStyle: 2
ScaledBorderAndShadow: no

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${Object.values(this.fontStyles).join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
                `.trim();
                return meta + "\n" + this.danmakus
                    .map(it => it.text(this.fontStyles, this.blockTypes))
                    .filter(it => it !== "").join("\n");
            }
        }

        class DanmakuStack
        {
            constructor(font, resolution, duration)
            {
                this.horizontal = [];
                this.horizontalTrack = [];
                this.vertical = [];
                this.resolution = resolution;
                this.duration = duration;
                this.canvas = document.createElement("canvas");
                this.context = this.canvas.getContext("2d");
                // XML字体大小到实际大小的表
                this.fontSizes = {
                    25: `52px ${font}`,
                    18: `36px ${font}`,
                };
                this.danmakuType = {
                    1: "normal",
                    2: "normal",
                    3: "normal",
                    4: "bottom",
                    5: "top",
                    6: "reversed",
                    7: "special",
                    8: "special",
                };
                this.margin = 10;
                this.generateTracks();
            }
            generateTracks()
            {
                this.context.font = this.fontSizes[25];
                const metrics = this.context.measureText("Lorem ipsum");
                const height = metrics.emHeightAscent + metrics.emHeightDescent;
                this.danmakuHeight = height;
                this.trackHeight = this.margin * 2 + height;
                this.trackCount = fixed(this.resolution.y / this.trackHeight, 0);
            }
            getTextSize(danmaku)
            {
                this.context.font = this.fontSizes[danmaku.fontSize];
                const metrics = this.context.measureText(danmaku.content);
                const x = metrics.width / 2;
                return [x, this.danmakuHeight];
            }
            getHorizonalTags(danmaku)
            {
                const [x, y] = this.getTextSize(danmaku);
                const width = x * 2;
                const time = this.duration * width / (this.resolution.x + width) + 0.5;
                let track = 0;
                let closestDanmaku = null;
                // 寻找已发送弹幕中可能重叠的
                do
                {
                    closestDanmaku = this.horizontalTrack.find(it => it.track === track && it.end > danmaku.time);
                    track++;
                }
                while (closestDanmaku &&
                closestDanmaku.start < danmaku.time &&
                closestDanmaku.halfWidth > width &&
                    track <= this.trackCount);
                // 如果弹幕过多, 此条就不显示了
                if (track > this.trackCount)
                {
                    return "";
                }
                track--; // 减回最后的自增
                this.horizontalTrack.push({
                    halfWidth: x,
                    start: danmaku.time,
                    end: danmaku.time + time,
                    track: track
                });
                return `\\move(${this.resolution.x + x}, ${track * this.trackHeight + this.margin + y}, ${-x}, ${track * this.trackHeight + this.margin + y}, 0, ${this.duration * 1000})`;
            }
            getVerticalTags(danmaku)
            {
                // TODO: place verizontal tags
                const [, y] = this.getTextSize(danmaku);
                if (this.danmakuType[danmaku.type] === "top")
                {
                    return `\\pos(${this.resolution.x / 2}, ${this.margin + y})`;
                }
                else
                {
                    return `\\pos(${this.resolution.x / 2}, ${this.resolution.y - this.margin - y})`;
                }
            }
            push(danmaku)
            {
                let tags = null;
                let stack = null;
                switch (this.danmakuType[danmaku.type])
                {
                    case "normal":
                    case "reversed":
                        {
                            tags = this.getHorizonalTags(danmaku);
                            stack = this.horizontal;
                            break;
                        }
                    case "top":
                    case "bottom":
                        {
                            tags = this.getVerticalTags(danmaku);
                            stack = this.vertical;
                            break;
                        }
                    case "special":
                    default:
                        {
                            throw new Error("Danmaku type not supported");
                        }
                }
                const info = {
                    tags
                };
                stack.push(info);
                return info;
            }
        }
        class DanmakuConverter
        {
            constructor({ title, font, alpha, duration, blockTypes, resolution })
            {
                this.title = title;
                this.font = font;
                this.alpha = Math.round(alpha * 100);
                this.duration = duration;
                this.blockTypes = blockTypes;
                this.resolution = resolution;
                this.danmakuStack = new DanmakuStack(font, resolution, duration);
            }
            get fontStyles()
            {
                return {
                    25: `Style: Medium,${this.font},52,&H${this.alpha}FFFFFF,&H${this.alpha}FFFFFF,&H${this.alpha}000000,&H${this.alpha}000000,0,0,0,0,100,100,0,0,1,1,0,5,0,0,0,0`,
                    18: `Style: Small,${this.font},36,&H${this.alpha}FFFFFF,&H${this.alpha}FFFFFF,&H${this.alpha}000000,&H${this.alpha}000000,0,0,0,0,100,100,0,0,1,1,0,5,0,0,0,0`,
                };
            }
            convertToAssDocument(xmlDanmakuDocument)
            {
                const assDanmakus = [];
                for (const xmlDanmaku of xmlDanmakuDocument.danmakus.sort((a, b) => a.time - b.time))
                {
                    // 跳过高级弹幕和设置为屏蔽的弹幕类型
                    if (this.blockTypes.concat(7, 8).indexOf(xmlDanmaku.type) !== -1)
                    {
                        continue;
                    }
                    const [startTime, endTime] = this.convertTime(xmlDanmaku.time, this.duration);
                    assDanmakus.push(new AssDanmaku({
                        content: xmlDanmaku.content,
                        time: startTime,
                        endTime: endTime,
                        type: xmlDanmaku.type,
                        fontSize: xmlDanmaku.fontSize,
                        color: xmlDanmaku.color,
                        typeTag: this.convertType(xmlDanmaku),
                        colorTag: this.convertColor(xmlDanmaku.color),
                    }));
                }
                return new AssDanmakuDocument({
                    danmakus: assDanmakus,
                    title: this.title,
                    blockTypes: this.blockTypes,
                    fontStyles: this.fontStyles,
                    resolution: this.resolution
                });
            }
            convertType(danmaku)
            {
                return this.danmakuStack.push(danmaku).tags;
            }
            convertColor(decColor)
            {
                const white = 16777215;
                if (decColor === white)
                {
                    return "";
                }
                const hex = decColor.toString(16);
                const red = hex.substring(4, 6);
                const green = hex.substring(2, 4);
                const blue = hex.substring(0, 2);
                return `\\c&H${blue}${green}${red}&`;
            }
            convertTime(startTime, duration)
            {
                function round(number)
                {
                    return Math.round(number * 100) / 100;
                }
                function secondsToTime(seconds)
                {
                    let hours = 0;
                    let minutes = 0;
                    while (seconds >= 60)
                    {
                        seconds -= 60;
                        minutes++;
                    }
                    while (minutes >= 60)
                    {
                        minutes -= 60;
                        hours++;
                    }
                    return `${hours}:${minutes.toString().padStart(2, "0")}:${round(seconds).toString().padStart(4, "0")}`;
                }
                return [secondsToTime(startTime), secondsToTime(startTime + duration)];
            }
        }
        return {
            export: {
                AssDanmaku,
                AssDanmakuDocument,
                Danmaku,
                DanmakuConverter,
                DanmakuStack,
                XmlDanmaku,
                XmlDanmakuDocument,
            },
        };
    };
})();