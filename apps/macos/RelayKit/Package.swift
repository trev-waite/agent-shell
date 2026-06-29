// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "RelayKit",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "RelayKit", targets: ["RelayKit"]),
    ],
    targets: [
        .target(name: "RelayModels", path: "Sources/RelayModels"),
        .target(
            name: "RelayClient",
            dependencies: ["RelayModels"],
            path: "Sources/RelayClient"
        ),
        .target(
            name: "RelayProjections",
            dependencies: ["RelayModels"],
            path: "Sources/RelayProjections"
        ),
        .target(
            name: "RelayState",
            dependencies: ["RelayModels", "RelayProjections"],
            path: "Sources/RelayState"
        ),
        .target(
            name: "RelayKit",
            dependencies: ["RelayModels", "RelayClient", "RelayState", "RelayProjections"],
            path: "Sources/RelayKit"
        ),
        .testTarget(
            name: "RelayKitTests",
            dependencies: ["RelayKit", "RelayState", "RelayClient"],
            path: "Tests/RelayKitTests"
        ),
    ]
)
