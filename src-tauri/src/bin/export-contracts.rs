fn main() {
    match switch_project_panel_lib::export_typescript_contracts() {
        Ok(path) => {
            println!("Generated TypeScript contracts: {}", path.display());
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
