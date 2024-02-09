#!/usr/bin/env python
"""
This file will update all imports to ESM on all js files in an extension directory,
as well as wrap extension.js methods in a new class that extends Extension,
and various other adjustments to help get extensions updated to gnome-shell 45.
"""
import os
import re
import sys
import json
import shutil
from pprint import pprint


def main(extension_directory: str):
    if not os.path.isdir(extension_directory):
        print(
            f"Provided extension directory is not a valid directory ({extension_directory})"
        )

    update_directory = extension_directory + ".GNOME45"

    all_source_files = []
    for path, subdirs, files in os.walk(extension_directory):
        relative_path = path.replace(extension_directory, "")
        all_source_files += [os.path.join(relative_path, f) for f in files]

    source_files = [
        f
        for f in all_source_files
        if os.path.isfile(os.path.join(extension_directory, f)) and f.endswith(".js")
    ]

    shutil.copytree(extension_directory, update_directory, dirs_exist_ok=True)

    with open(os.path.join(extension_directory, "metadata.json")) as f:
        metadata = json.load(f)
        # print(metadata)

    os.makedirs(update_directory, exist_ok=True)

    user_messages = {}

    extension_class_name = extension_directory.split("@")[0].capitalize()

    # Get and remap imports with regex
    pattern = r"(?P<decleration_type>(const)|(let)|(var))\s+(?P<var_names>[{]?[\w\s,]+[}]?)\s+(?P<import_path_full>=\s+(?P<local_import>[\w]*)?(.?)imports(.?)(?P<import_path>[\w.]+)?)(?P<function>\(.+)?"

    errors = {}
    changed_imports = {}
    for relative_file_path in source_files:
        file_name = os.path.basename(relative_file_path)
        file_path = os.path.join(extension_directory, relative_file_path)
        print("\n  |$>", relative_file_path)
        errors[relative_file_path] = []
        import_use_remaps = []
        changed_imports[relative_file_path] = []
        with open(file_path) as f:
            file_contents = f.read()
            new_file_contents = file_contents
            module_imported = False
            extension_imported = False

            # Update the extension.js functions into
            if file_name == "prefs.js":
                user_messages["Please manually update `prefs.js`"] = True
                print("Please manually update this file")
                continue

            if file_name == "extension.js":
                extension_pattern = r"function\s*([A-z0-9]+)?\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)\s*\{(?:[^}{]+|\{(?:[^}{]+|\{[^}{]*\})*\})*\}"
                ext_matches = list(
                    re.finditer(extension_pattern, file_contents, flags=re.MULTILINE)
                )

                new_class_contents = ""
                if not extension_imported:
                    new_class_contents = "import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';\n\n"
                    extension_imported = True

                new_class_contents += f"export default class {extension_class_name} extends Extension {{\n\n"
                new_class_contents += (
                    "\n\n".join(
                        [
                            em.string[em.start() : em.end()].replace("function", "")
                            for em in ext_matches
                        ]
                    )
                    + "\n\n}\n"
                )

                s, e = ext_matches[-1].span()
                new_file_contents = new_file_contents[:s] + new_file_contents[e:]
                s, e = ext_matches[0].span()
                new_file_contents = (
                    new_file_contents[:s] + new_class_contents + new_file_contents[e:]
                )
                # print(new_file_contents)

            matches: list[re.Match] = list(re.finditer(pattern, new_file_contents))
            for match in matches:
                spos, epos = match.span()
                match_groups: dict[str, str] = match.groupdict()
                new_import_target = None
                old_import_target = file_contents[spos:epos]

                var_names = (
                    match_groups["var_names"]
                    .replace("{", "")
                    .replace("}", "")
                    .strip()
                    .split(",")
                )
                var_names = [v.strip() for v in var_names]
                if match_groups["local_import"]:
                    new_import_target = ""
                    for var_name in var_names:
                        new_import_target += (
                            f"import * as {var_name} from './{var_name}.js';\n"
                        )
                    new_import_target = new_import_target.strip()
                elif match_groups["function"]:
                    fn = match_groups["function"]

                    if "getCurrentExtension" in match_groups["import_path"]:
                        assert (
                            len(var_names) == 1
                        ), "Mismatching var_names length in local import"
                        extension_import_name = var_names[0].capitalize()
                        if not module_imported:
                            new_import_target = f"import * as {extension_import_name}Module from './extension.js'; \nconst {extension_import_name} = {extension_import_name}Module.{extension_class_name};"
                            module_imported = True
                        else:
                            new_import_target = ""
                    elif "gettext.domain" in match_groups["import_path"]:
                        assert (
                            len(var_names) == 1
                        ), "Mismatching var_names length in gettext import"
                        gettext_import_name = var_names[0].capitalize()
                        new_import_target = ""
                        if not extension_imported:
                            new_import_target = f"import {{ Extension, gettext as {gettext_import_name} }} from 'resource:///org/gnome/shell/extensions/extension.js';"
                            extension_imported = True
                        user_messages[
                            "Please set the `gettext-domain` key in `metadata.json`"
                        ] = True
                        # TODO: Handle other ways of importing gettext e.g. from extensionUtils.getText method

                    else:
                        errors[relative_file_path].append(
                            ("Unhandled Function Import", match, match_groups)
                        )
                elif match_groups["import_path"] == "gi":
                    version_pattern = r"(?P<import_path_full>imports.(?P<import_path>[\w.]+))\s+=\s+?['|\"](?P<version_number>[\d.]+)['|\"]"
                    version_matches: list[re.Match] = list(
                        re.finditer(version_pattern, file_contents)
                    )

                    new_import_target = ""
                    for var_name in var_names:
                        version = ""
                        for version_match in version_matches:
                            version_match_groups = version_match.groupdict()
                            lib_name = version_match_groups["import_path"].split(".")[
                                -1
                            ]
                            if lib_name.strip() == var_name:
                                version = version_match_groups["version_number"]

                        new_import_target += (
                            old_import_target.replace(
                                match_groups["var_names"], var_name
                            )
                            .replace(
                                match_groups["import_path_full"],
                                f"from 'gi://{var_name}{f'?version={version}' if version else ''}'",
                            )
                            .replace(match_groups["decleration_type"], "import")
                            + "\n"
                        )
                elif (
                    "misc" in match_groups["import_path"]
                    or "imports.ui" in match_groups["import_path_full"]
                ):
                    dir = "misc" if "misc" in match_groups["import_path"] else "ui"
                    # Handle imports.misc structure remapping
                    new_import_target = ""
                    for var_name in var_names:
                        new_import_target += f"import * as {var_name} from 'resource:///org/gnome/shell/{dir}/{var_name[0].lower() + var_name[1:]}.js';\n"
                        import_use_pattern = rf"(?P<decleration>.*)(?P<var_name>{var_name}).(?P<fn_name>\w+)(?P<fn_args>\(.*\))[;?]"
                        import_use_matches = list(
                            re.finditer(import_use_pattern, new_file_contents)
                        )

                        # Replace usage
                        for import_use_match in import_use_matches:
                            s, e = import_use_match.span()
                            match_text = import_use_match.string[s:e]
                            if "extensionUtils" in match_text:
                                if "getSettings" in match_text:
                                    if not extension_imported:
                                        new_import_target += "\nimport { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';\n\n"
                                        extension_imported = True
                                        import_use_remaps.append(
                                            (
                                                "extensionUtils.getSettings",
                                                "Extension.getSettings",
                                            )
                                        )
                                if "getCurrentExtension" in match_text:
                                    if not module_imported:
                                        new_import_target += f"\nimport * as {extension_import_name}Module from './extension.js'; \nconst {extension_import_name} = {extension_import_name}Module.{extension_class_name};\n"
                                        module_imported = True
                                    import_use_remaps.append((match_text, ""))
                        # print(var_name, "XXXX", import_use_match, match_text)

                    new_import_target = new_import_target.strip()
                else:
                    import_path_parts = match_groups["import_path"].split(".")
                    new_import_target = "/".join(import_path_parts) + ".js"
                    new_import_target = new_import_target.strip()
                    new_import_target = (
                        old_import_target.replace(
                            match_groups["import_path_full"],
                            f"from 'resource:///org/gnome/shell/{new_import_target}'",
                        )
                        .replace(match_groups["decleration_type"], "import")
                        .replace(" Main", " * as Main")
                        .replace(" Util", " * as Util")
                    )

                if new_import_target is None:
                    errors[relative_file_path].append(
                        ("Unhandled import", match, match_groups)
                    )
                else:
                    new_import_target = new_import_target.strip()
                    changed_imports[relative_file_path].append(
                        (
                            match,
                            old_import_target,
                            new_import_target,
                        )
                    )
                    new_file_contents = new_file_contents.replace(
                        old_import_target, new_import_target
                    )

            import_use_remaps.append(
                ("Main.extensionManager.lookup", "Extension.lookupByUUID")
            )
            for old_text, new_text in import_use_remaps:
                new_file_contents = new_file_contents.replace(old_text, new_text)

            import_changes = changed_imports[relative_file_path]
            print(len(import_changes), "imports updated")
            for change in import_changes:
                m, old, new = change
                # print(m)
                # print(m.groupdict())
                # print("OLD:", old)
                # print("NEW:", new)
                # print()

            new_file_path = os.path.join(update_directory, relative_file_path)
            os.makedirs(os.path.dirname(new_file_path), exist_ok=True)
            with open(new_file_path, "w") as nf:
                nf.write(new_file_contents)

    print()
    all_import_changes = sum(
        [imports for imports in list(changed_imports.values())], []
    )
    # pprint(all_import_changes)
    print(
        len(all_import_changes),
        "imports updated in",
        len([c for filename, c in changed_imports.items() if len(c) > 0]),
        "of",
        len(source_files),
        "files.",
    )
    print("Updates saved to:", update_directory)
    print(list(user_messages.keys()))
    pprint({fname: errors for fname, errors in errors.items() if len(errors)})


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Please provide the extension directory as the first console argument")
    else:
        main(sys.argv[1])
