#!/usr/bin/env python
import os
import re
import sys


def main(extension_directory: str):
    if not os.path.isdir(extension_directory):
        print(
            f"Provided extension directory is not a valid directory ({extension_directory})"
        )

    source_files = [
        f
        for f in os.listdir(extension_directory)
        if os.path.isfile(os.path.join(extension_directory, f))
        and f.endswith(".js")
        and f != "prefs.js"
    ]

    # Get and remap imports with regex
    pattern = r"(?P<decleration_type>(const)|(let)|(var))\s+(?P<var_names>[{]?[\w\s,]+[}]?)\s+(?P<import_path_full>=\s+(?P<local_import>Me.)?imports.(?P<import_path>[\w.]+))(?P<function>\(.+)?"
    for file in source_files:
        with open(os.path.join(extension_directory, file)) as f:
            file_contents = f.read()
            matches: list[re.Match] = list(re.finditer(pattern, file_contents))
            print("  |$>", file)
            for match in matches:
                spos, epos = match.span()
                match_groups: dict[str, str] = match.groupdict()
                new_import_target = ""
                old_import_target = file_contents[spos:epos]

                print(match)
                print(match_groups)

                var_names = (
                    match_groups["var_names"]
                    .replace("{", "")
                    .replace("}", "")
                    .strip()
                    .split(",")
                )
                if match_groups["local_import"]:
                    new_import_target = (
                        f"import * as {var_names[0]} from './{var_names[0]}.js';"
                    )
                elif match_groups["function"]:
                    fn = match_groups["function"]
                    if "getCurrentExtension" in match_groups["import_path"]:
                        new_import_target = "import * as Me from './extension.js';"
                elif match_groups["import_path"] == "gi":
                    ver = ""
                    new_import_target = ""
                    for var_name in var_names:
                        var_name = var_name.strip()
                        new_import_target += (
                            old_import_target.replace(
                                match_groups["var_names"], var_name
                            )
                            .replace(
                                match_groups["import_path_full"],
                                f"from 'gi://{var_name}?version={ver}';",
                            )
                            .replace(match_groups["decleration_type"], "import")
                            + "\n"
                        )
                else:
                    import_path_parts = match_groups["import_path"].split(".")
                    new_import_target = "/".join(import_path_parts) + ".js"
                    new_import_target = (
                        old_import_target.replace(
                            match_groups["import_path_full"],
                            f"from 'resource:///org/gnome/shell/{new_import_target}';",
                        )
                        .replace(match_groups["decleration_type"], "import")
                        .replace("Main", "* as Main")
                        .replace("Util", "* as Util")
                    )

                    # file_contents = file_contents.replace(file_contents[spos:epos], new_import_target)
                    # file_contents = file_contents[:spos] + new_import_target + file_contents[:epos]
                print(old_import_target)
                print(new_import_target)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Please provide the extension directory as the first console argument")
    else:
        main(sys.argv[1])
