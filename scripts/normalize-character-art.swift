#!/usr/bin/env swift

import AppKit
import Foundation

struct Crop {
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
}

let root = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath
let art = URL(fileURLWithPath: root).appendingPathComponent("public/assets/art")
let output = URL(fileURLWithPath: root).appendingPathComponent("public/assets/characters")
let runtimeOutput = URL(fileURLWithPath: root).appendingPathComponent("public/assets")

func image(_ name: String) -> NSImage {
    guard let value = NSImage(contentsOf: art.appendingPathComponent(name)) else {
        fatalError("Could not load \(name)")
    }
    return value
}

/** Remove disconnected pixels introduced by neighboring cells in generated collection art. */
func retainLargestAlphaComponent(
    bitmap: NSBitmapImageRep,
    frameX: Int,
    frameY: Int,
    frameWidth: Int,
    frameHeight: Int
) {
    guard let data = bitmap.bitmapData else { return }
    let bytesPerPixel = bitmap.bitsPerPixel / 8
    guard bytesPerPixel == 4 else { return }
    let count = frameWidth * frameHeight
    var labels = Array(repeating: Int32(0), count: count)
    var sizes = [0]
    var nextLabel: Int32 = 1
    var queue = Array(repeating: 0, count: count)

    func alpha(_ localX: Int, _ localY: Int) -> UInt8 {
        data[(frameY + localY) * bitmap.bytesPerRow + (frameX + localX) * bytesPerPixel + 3]
    }

    for y in 0..<frameHeight {
        for x in 0..<frameWidth {
            let start = y * frameWidth + x
            if labels[start] != 0 || alpha(x, y) <= 8 { continue }
            let label = nextLabel
            nextLabel += 1
            var head = 0
            var tail = 1
            var size = 0
            queue[0] = start
            labels[start] = label
            while head < tail {
                let index = queue[head]
                head += 1
                size += 1
                let currentX = index % frameWidth
                let currentY = index / frameWidth
                for offsetY in -1...1 {
                    for offsetX in -1...1 where offsetX != 0 || offsetY != 0 {
                        let neighborX = currentX + offsetX
                        let neighborY = currentY + offsetY
                        if neighborX < 0 || neighborX >= frameWidth || neighborY < 0 || neighborY >= frameHeight { continue }
                        let neighbor = neighborY * frameWidth + neighborX
                        if labels[neighbor] == 0 && alpha(neighborX, neighborY) > 8 {
                            labels[neighbor] = label
                            queue[tail] = neighbor
                            tail += 1
                        }
                    }
                }
            }
            sizes.append(size)
        }
    }

    guard let largest = sizes.indices.dropFirst().max(by: { sizes[$0] < sizes[$1] }) else { return }
    let retainedLabel = Int32(largest)
    for y in 0..<frameHeight {
        for x in 0..<frameWidth {
            let index = y * frameWidth + x
            if labels[index] == retainedLabel { continue }
            let pixel = (frameY + y) * bitmap.bytesPerRow + (frameX + x) * bytesPerPixel
            data[pixel] = 0
            data[pixel + 1] = 0
            data[pixel + 2] = 0
            data[pixel + 3] = 0
        }
    }
}

func writeSheet(
    source: NSImage,
    crops: [[Crop]],
    frameWidth: Int,
    frameHeight: Int,
    destination: URL,
    maximumContentWidth: CGFloat,
    maximumContentHeight: CGFloat,
    bottomPadding: CGFloat = 4
) {
    let columns = crops.map(\.count).max() ?? 0
    let rows = crops.count
    let width = columns * frameWidth
    let height = rows * frameHeight
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { fatalError("Could not allocate \(destination.lastPathComponent)") }

    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()

    for (row, rowCrops) in crops.enumerated() {
        for (column, crop) in rowCrops.enumerated() {
            let scale = min(maximumContentWidth / crop.width, maximumContentHeight / crop.height)
            let drawWidth = crop.width * scale
            let drawHeight = crop.height * scale
            let frameX = CGFloat(column * frameWidth)
            let frameY = CGFloat(height - (row + 1) * frameHeight)
            let destinationRect = NSRect(
                x: frameX + (CGFloat(frameWidth) - drawWidth) / 2,
                y: frameY + bottomPadding,
                width: drawWidth,
                height: drawHeight
            )
            let sourceRect = NSRect(
                x: crop.x,
                y: source.size.height - crop.y - crop.height,
                width: crop.width,
                height: crop.height
            )
            source.draw(
                in: destinationRect,
                from: sourceRect,
                operation: .sourceOver,
                fraction: 1,
                respectFlipped: false,
                hints: [.interpolation: NSImageInterpolation.high]
            )
        }
    }
    context.flushGraphics()
    for row in 0..<rows {
        for column in 0..<columns {
            retainLargestAlphaComponent(
                bitmap: bitmap,
                frameX: column * frameWidth,
                frameY: height - (row + 1) * frameHeight,
                frameWidth: frameWidth,
                frameHeight: frameHeight
            )
        }
    }
    NSGraphicsContext.restoreGraphicsState()

    try! FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Could not encode \(destination.lastPathComponent)")
    }
    try! png.write(to: destination)
}

func duplicated(_ first: Crop, _ second: Crop) -> [Crop] { [first, second, first] }

let friends = image("four_character_rpg_sprite_sheet.png")
let npcCrops: [String: [[Crop]]] = [
    "billy": [
        [Crop(x: 35, y: 18, width: 124, height: 267), Crop(x: 165, y: 18, width: 124, height: 267), Crop(x: 290, y: 18, width: 124, height: 267)],
        [Crop(x: 20, y: 305, width: 132, height: 235), Crop(x: 150, y: 305, width: 132, height: 235), Crop(x: 282, y: 305, width: 134, height: 235)],
        [Crop(x: 20, y: 555, width: 132, height: 230), Crop(x: 150, y: 555, width: 132, height: 230), Crop(x: 282, y: 555, width: 134, height: 230)],
        [Crop(x: 38, y: 805, width: 120, height: 219), Crop(x: 168, y: 805, width: 120, height: 219), Crop(x: 292, y: 805, width: 120, height: 219)],
    ],
    "andrew": [
        duplicated(Crop(x: 440, y: 18, width: 128, height: 267), Crop(x: 580, y: 18, width: 128, height: 267)),
        duplicated(Crop(x: 440, y: 300, width: 130, height: 240), Crop(x: 585, y: 300, width: 132, height: 240)),
        duplicated(Crop(x: 440, y: 550, width: 130, height: 235), Crop(x: 585, y: 550, width: 132, height: 235)),
        duplicated(Crop(x: 450, y: 800, width: 124, height: 224), Crop(x: 590, y: 800, width: 124, height: 224)),
    ],
    "jeremy": [
        [Crop(x: 802, y: 18, width: 118, height: 267), Crop(x: 932, y: 18, width: 118, height: 267), Crop(x: 1062, y: 18, width: 118, height: 267)],
        [Crop(x: 792, y: 310, width: 128, height: 230), Crop(x: 925, y: 310, width: 128, height: 230), Crop(x: 1055, y: 310, width: 130, height: 230)],
        [Crop(x: 792, y: 550, width: 128, height: 235), Crop(x: 925, y: 550, width: 128, height: 235), Crop(x: 1055, y: 550, width: 130, height: 235)],
        [Crop(x: 805, y: 800, width: 118, height: 224), Crop(x: 935, y: 800, width: 118, height: 224), Crop(x: 1062, y: 800, width: 118, height: 224)],
    ],
    "ryan": [
        duplicated(Crop(x: 1218, y: 8, width: 134, height: 277), Crop(x: 1362, y: 8, width: 142, height: 277)),
        duplicated(Crop(x: 1208, y: 305, width: 146, height: 235), Crop(x: 1358, y: 305, width: 158, height: 235)),
        duplicated(Crop(x: 1208, y: 555, width: 146, height: 230), Crop(x: 1358, y: 555, width: 158, height: 230)),
        duplicated(Crop(x: 1218, y: 795, width: 134, height: 229), Crop(x: 1362, y: 795, width: 142, height: 229)),
    ],
]

for (name, crops) in npcCrops {
    writeSheet(
        source: friends,
        crops: crops,
        frameWidth: 128,
        frameHeight: 256,
        destination: output.appendingPathComponent("npcs/\(name).png"),
        maximumContentWidth: 118,
        maximumContentHeight: 236
    )
}

let twins = image("twin_character_rpg_sprite_sheet.png")
let twinNpcCrops: [String: [[Crop]]] = [
    "mickey": [
        [Crop(x: 35, y: 15, width: 135, height: 395), Crop(x: 195, y: 15, width: 135, height: 395), Crop(x: 360, y: 15, width: 142, height: 395)],
        [Crop(x: 5, y: 400, width: 170, height: 380), Crop(x: 170, y: 400, width: 170, height: 380), Crop(x: 335, y: 400, width: 175, height: 380)],
        [Crop(x: 5, y: 770, width: 170, height: 380), Crop(x: 170, y: 770, width: 170, height: 380), Crop(x: 352, y: 770, width: 158, height: 380)],
        [Crop(x: 20, y: 1140, width: 148, height: 396), Crop(x: 185, y: 1140, width: 148, height: 396), Crop(x: 352, y: 1140, width: 150, height: 396)],
    ],
    "schwartz": [
        [Crop(x: 545, y: 15, width: 150, height: 395), Crop(x: 710, y: 15, width: 150, height: 395), Crop(x: 875, y: 15, width: 149, height: 395)],
        [Crop(x: 535, y: 400, width: 170, height: 380), Crop(x: 700, y: 400, width: 170, height: 380), Crop(x: 865, y: 400, width: 159, height: 380)],
        [Crop(x: 535, y: 770, width: 170, height: 380), Crop(x: 700, y: 770, width: 170, height: 380), Crop(x: 865, y: 770, width: 159, height: 380)],
        [Crop(x: 545, y: 1140, width: 155, height: 396), Crop(x: 710, y: 1140, width: 155, height: 396), Crop(x: 875, y: 1140, width: 149, height: 396)],
    ],
]
for (name, crops) in twinNpcCrops {
    writeSheet(
        source: twins,
        crops: crops,
        frameWidth: 128,
        frameHeight: 256,
        destination: output.appendingPathComponent("npcs/\(name).png"),
        maximumContentWidth: 118,
        maximumContentHeight: 236
    )
}

let player = image("chibi_rpg_character_sprite_atlas.png")
let playerCrops: [[Crop]] = [
    [Crop(x: 35, y: 0, width: 82, height: 136), Crop(x: 137, y: 0, width: 82, height: 136), Crop(x: 238, y: 0, width: 82, height: 136)],
    [Crop(x: 28, y: 145, width: 94, height: 130), Crop(x: 130, y: 145, width: 94, height: 130), Crop(x: 232, y: 145, width: 94, height: 130)],
    [Crop(x: 34, y: 275, width: 84, height: 140), Crop(x: 136, y: 275, width: 84, height: 140), Crop(x: 238, y: 275, width: 84, height: 140)],
]
writeSheet(
    source: player,
    crops: playerCrops,
    frameWidth: 128,
    frameHeight: 140,
    destination: output.appendingPathComponent("player/body.png"),
    maximumContentWidth: 92,
    maximumContentHeight: 132
)

func writeSingle(source: NSImage, crop: Crop, destination: URL) {
    writeSheet(
        source: source,
        crops: [[crop]],
        frameWidth: Int(crop.width),
        frameHeight: Int(crop.height),
        destination: destination,
        maximumContentWidth: crop.width,
        maximumContentHeight: crop.height,
        bottomPadding: 0
    )
}

let sedan = image("gray_sedan_sprite_sheet_collection.png")
let vehicles: [String: Crop] = [
    "down": Crop(x: 5, y: 60, width: 355, height: 285),
    "left": Crop(x: 5, y: 395, width: 350, height: 215),
    "right": Crop(x: 5, y: 680, width: 350, height: 205),
    "up": Crop(x: 5, y: 930, width: 355, height: 285),
]
for (direction, crop) in vehicles {
    writeSingle(
        source: sedan,
        crop: crop,
        destination: runtimeOutput.appendingPathComponent("vehicles/mickey-car-\(direction).png")
    )
}

let clubhouse = image("creek_clubhouse_building_kit_spritesheet.png")
let clubhouseCrops: [(String, Crop)] = [
    ("clubhouse-frame.png", Crop(x: 20, y: 5, width: 410, height: 470)),
    ("clubhouse-half-built.png", Crop(x: 440, y: 5, width: 380, height: 480)),
    ("clubhouse-complete.png", Crop(x: 810, y: 5, width: 455, height: 500)),
    ("props/flag.png", Crop(x: 5, y: 475, width: 180, height: 220)),
]
for (name, crop) in clubhouseCrops {
    writeSingle(
        source: clubhouse,
        crop: crop,
        destination: runtimeOutput.appendingPathComponent("creek-clubhouse/\(name)")
    )
}

print("Normalized character, vehicle, and clubhouse art.")
