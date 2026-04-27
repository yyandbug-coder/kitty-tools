fn main() {
    tauri_build::build();
    // screencapturekit 的 Swift 侧通过 @rpath 引用 libswift_Concurrency。系统 TBD 的 install name 为
    // /usr/lib/swift/libswift_Concurrency.dylib —— 只加入 /usr/lib/swift 作为 rpath，与系统 Swift 一致，
    // 勿再指向 Xcode 工具链内的副本，否则会与 /usr/lib/swift 各加载一份，触发 objc 重复类警告。
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
}
