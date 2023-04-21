# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'VoiceScripter'
copyright = '2023, wabimochi'
author = 'wabimochi'
release = '1.0.0'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    'myst_parser',
    'sphinx_rtd_theme'
]
myst_enable_extensions = [
    'attrs_inline'
]

templates_path = ['_templates']
exclude_patterns = []

language = 'ja'

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'sphinx_rtd_theme'
html_static_path = ['_static']
html_style = [
    'css/voicescripter.css'
]
html_js_files = [
    'js/css_browser_selector.js',
]

html_sidebars = {
    '**': ['globaltoc.html', 'sourcelink.html', 'searchbox.html'],
}
html_theme_options = {
    'navigation_depth': 3,
}
 
source_suffix = ['.rst', '.md']