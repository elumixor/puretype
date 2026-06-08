#!/usr/bin/env ruby
# Adds the watchOS app + widget extension targets to App.xcodeproj and wires
# sources, resources, Info.plists, entitlements, signing, dependencies and the
# embed (copy-files) build phases. Idempotent: re-running removes and recreates
# the two targets cleanly.
require "xcodeproj"

PROJ = File.expand_path("App/App.xcodeproj", __dir__)
TEAM = "464K6UHCU4"
WATCH_NAME = "PureTypeWatch"
WIDGET_NAME = "PureTypeWatchWidget"
WATCH_BUNDLE = "app.puretype.watchkitapp"
WIDGET_BUNDLE = "app.puretype.watchkitapp.widget"
MARKETING = "2.0.1"

project = Xcodeproj::Project.open(PROJ)
app_target = project.targets.find { |t| t.name == "PureType" }
raise "App target not found" unless app_target

# --- clean previous runs -----------------------------------------------------
[WATCH_NAME, WIDGET_NAME].each do |name|
  if (t = project.targets.find { |x| x.name == name })
    # drop dependencies & embed build files referencing it
    project.targets.each do |other|
      other.dependencies.dup.each { |d| d.remove_from_project if d.target == t }
      other.build_phases.grep(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase).each do |ph|
        ph.files.dup.each do |bf|
          ref = bf.file_ref
          bf.remove_from_project if ref && ref == t.product_reference
        end
      end
    end
    t.product_reference&.remove_from_project
    t.remove_from_project
  end
end
[WATCH_NAME, WIDGET_NAME].each do |name|
  if (g = project.main_group.children.find { |c| c.display_name == name })
    g.remove_from_project
  end
end

src_root = File.expand_path("App", __dir__)

def add_settings(target, common)
  target.build_configurations.each do |c|
    common.each { |k, v| c.build_settings[k] = v }
    c.build_settings["CODE_SIGN_STYLE"] = c.name == "Release" ? "Manual" : "Automatic"
  end
end

# ---------------------------------------------------------------------------
# Widget extension (watchOS)
# ---------------------------------------------------------------------------
widget = project.new_target(:app_extension, WIDGET_NAME, :watchos, "10.0", nil, :swift)
widget_group = project.main_group.new_group(WIDGET_NAME, "App/#{WIDGET_NAME}")

# Shared.swift compiled into both the widget and the watch app.
shared_ref = widget_group.new_reference(File.join(src_root, "WatchApp/Shared.swift"))
widget_ref = widget_group.new_reference(File.join(src_root, "WatchWidget/PureTypeWidget.swift"))
widget.add_file_references([shared_ref, widget_ref])
widget_assets = widget_group.new_reference(File.join(src_root, "WatchWidget/Assets.xcassets"))
widget.add_resources([widget_assets])

add_settings(widget, {
  "SDKROOT" => "watchos",
  "WATCHOS_DEPLOYMENT_TARGET" => "10.0",
  "TARGETED_DEVICE_FAMILY" => "4",
  "PRODUCT_BUNDLE_IDENTIFIER" => WIDGET_BUNDLE,
  "PRODUCT_NAME" => "$(TARGET_NAME)",
  "SWIFT_VERSION" => "5.0",
  "INFOPLIST_FILE" => "WatchWidget/Info.plist",
  "CODE_SIGN_ENTITLEMENTS" => "WatchWidget/WatchWidget.entitlements",
  "DEVELOPMENT_TEAM" => TEAM,
  "GENERATE_INFOPLIST_FILE" => "NO",
  "MARKETING_VERSION" => MARKETING,
  "CURRENT_PROJECT_VERSION" => "1",
  "SKIP_INSTALL" => "YES",
  "LD_RUNPATH_SEARCH_PATHS" => "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
  "SWIFT_EMIT_LOC_STRINGS" => "YES",
})

# ---------------------------------------------------------------------------
# Watch app (watchOS, modern single-target SwiftUI app)
# ---------------------------------------------------------------------------
watch = project.new_target(:application, WATCH_NAME, :watchos, "10.0", nil, :swift)
watch_group = project.main_group.new_group(WATCH_NAME, "App/WatchApp")

watch_swift = %w[
  Shared.swift TokenRender.swift APIClient.swift TaskStore.swift
  WatchConnectivityProvider.swift AudioRecorder.swift VoiceView.swift
  AddTaskView.swift ContentView.swift PureTypeWatchApp.swift
].map { |f| watch_group.new_reference(File.join(src_root, "WatchApp", f)) }
watch.add_file_references(watch_swift)
watch_assets = watch_group.new_reference(File.join(src_root, "WatchApp/Assets.xcassets"))
watch.add_resources([watch_assets])

add_settings(watch, {
  "SDKROOT" => "watchos",
  "WATCHOS_DEPLOYMENT_TARGET" => "10.0",
  "TARGETED_DEVICE_FAMILY" => "4",
  "PRODUCT_BUNDLE_IDENTIFIER" => WATCH_BUNDLE,
  "PRODUCT_NAME" => "$(TARGET_NAME)",
  "SWIFT_VERSION" => "5.0",
  "INFOPLIST_FILE" => "WatchApp/Info.plist",
  "CODE_SIGN_ENTITLEMENTS" => "WatchApp/WatchApp.entitlements",
  "DEVELOPMENT_TEAM" => TEAM,
  "GENERATE_INFOPLIST_FILE" => "NO",
  "MARKETING_VERSION" => MARKETING,
  "CURRENT_PROJECT_VERSION" => "1",
  "ASSETCATALOG_COMPILER_APPICON_NAME" => "AppIcon",
  "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME" => "AccentColor",
  "LD_RUNPATH_SEARCH_PATHS" => "$(inherited) @executable_path/Frameworks",
  "SWIFT_EMIT_LOC_STRINGS" => "YES",
  "ENABLE_PREVIEWS" => "YES",
})

# --- widget embedded into the watch app (PlugIns) ---------------------------
watch.add_dependency(widget)
embed_ext = watch.new_copy_files_build_phase("Embed Foundation Extensions")
embed_ext.symbol_dst_subfolder_spec = :plug_ins
ext_bf = embed_ext.add_file_reference(widget.product_reference, true)
ext_bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

# --- watch app embedded into the iOS app (Watch content) --------------------
app_target.add_dependency(watch)
embed_watch = app_target.new_copy_files_build_phase("Embed Watch Content")
embed_watch.symbol_dst_subfolder_spec = :products_directory
embed_watch.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
watch_bf = embed_watch.add_file_reference(watch.product_reference, true)
watch_bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

# --- iOS-side bridge source into the App target -----------------------------
app_group = project.main_group.children.find { |c| c.display_name == "App" }
bridge_path = "WatchSessionBridge.swift"
unless app_target.source_build_phase.files_references.any? { |r| r.display_name == bridge_path }
  bridge_ref = app_group.new_reference(File.join(src_root, "App", bridge_path))
  app_target.add_file_references([bridge_ref])
end

project.save
puts "Wired #{WATCH_NAME} + #{WIDGET_NAME} into #{File.basename(PROJ)}"
project.targets.each { |t| puts "  target: #{t.name} (#{t.product_type})" }
