// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "RelayMacWorkspace",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "RelayKit", targets: ["RelayKit"]),
        .executable(name: "RelayMac", targets: ["RelayMac"]),
    ],
    targets: [
        .target(name: "RelayModels", path: "RelayKit/Sources/RelayModels"),
        .target(
            name: "RelayClient",
            dependencies: ["RelayModels"],
            path: "RelayKit/Sources/RelayClient"
        ),
        .target(
            name: "RelayProjections",
            dependencies: ["RelayModels"],
            path: "RelayKit/Sources/RelayProjections"
        ),
        .target(
            name: "RelayState",
            dependencies: ["RelayModels", "RelayProjections"],
            path: "RelayKit/Sources/RelayState"
        ),
        .target(
            name: "RelayKit",
            dependencies: ["RelayModels", "RelayClient", "RelayState", "RelayProjections"],
            path: "RelayKit/Sources/RelayKit"
        ),
        .executableTarget(
            name: "RelayMac",
            dependencies: ["RelayKit"],
            path: "RelayMac",
            exclude: ["Info.plist"],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("SwiftUI"),
            ]
        ),
        .testTarget(
            name: "RelayKitTests",
            dependencies: ["RelayKit", "RelayState", "RelayClient"],
            path: "RelayKit/Tests/RelayKitTests"
        ),
    ]
)
