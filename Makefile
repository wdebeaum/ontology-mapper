INSTALL_DIR=/u/www/research/trips/lexicon/ontology-mapper
DSL_DATA_PATH=../dsl/
JQUERY_VERSION=3.1.1
JSTREE_VERSION=3.3.2
JQUERY_UI_VERSION=1.12.1
download=curl -O -L $(1)

DOWNLOADS = \
	jquery.min.js \
	jstree.min.js \
	style.min.css \
	32px.png \
	40px.png \
	throbber.gif \
	jquery-ui

# this doesn't work on Safari :(
#	str.replace.template.xsl

SRCS = \
	$(DOWNLOADS) \
	ontology-mapper.html \
	ontology-mapper.css \
	ontology-mapper.js \
	dsl-to-json.xsl

all: download

install: $(SRCS) install-doc
	mkdir -p $(INSTALL_DIR)
	cp -R $(SRCS) $(INSTALL_DIR)/
	sed -e "s@var DSL_DATA_PATH = 'dsl/'@var DSL_DATA_PATH = '$(DSL_DATA_PATH)'@" <ontology-mapper.js >$(INSTALL_DIR)/ontology-mapper.js

install-doc: doc/README.html
	mkdir -p $(INSTALL_DIR)/doc
	cp doc/README.html $(INSTALL_DIR)/doc

download: $(DOWNLOADS)

jquery.min.js:
	$(call download,https://code.jquery.com/jquery-$(JQUERY_VERSION).min.js)
	mv jquery-$(JQUERY_VERSION).min.js jquery.min.js

jstree.min.js:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/$@)

style.min.css 32px.png 40px.png throbber.gif:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/themes/default/$@)

#str.replace.template.xsl:
#	$(call download,http://exslt.org/str/functions/replace/str.replace.template.xsl)

# this horrendous command derived from going to http://jqueryui.com/download/,
# unchecking Components>Toggle All, checking Widgets>Autocomplete, and
# Widgets>Selectmenu, and then calling $('form').last().serialize() from the
# browser console.
jquery-ui-$(JQUERY_UI_VERSION).custom.zip:
	curl -o $@ -L "http://download.jqueryui.com/download" --data "version=$(JQUERY_UI_VERSION)&widget=on&position=on&form-reset-mixin=on&keycode=on&labels=on&unique-id=on&widgets%2Fautocomplete=on&widgets%2Fmenu=on&widgets%2Fselectmenu=on&theme=ffDefault%3DArial%252CHelvetica%252Csans-serif%26fsDefault%3D1em%26fwDefault%3Dnormal%26cornerRadius%3D3px%26bgColorHeader%3De9e9e9%26bgTextureHeader%3Dflat%26borderColorHeader%3Ddddddd%26fcHeader%3D333333%26iconColorHeader%3D444444%26bgColorContent%3Dffffff%26bgTextureContent%3Dflat%26borderColorContent%3Ddddddd%26fcContent%3D333333%26iconColorContent%3D444444%26bgColorDefault%3Df6f6f6%26bgTextureDefault%3Dflat%26borderColorDefault%3Dc5c5c5%26fcDefault%3D454545%26iconColorDefault%3D777777%26bgColorHover%3Dededed%26bgTextureHover%3Dflat%26borderColorHover%3Dcccccc%26fcHover%3D2b2b2b%26iconColorHover%3D555555%26bgColorActive%3D007fff%26bgTextureActive%3Dflat%26borderColorActive%3D003eff%26fcActive%3Dffffff%26iconColorActive%3Dffffff%26bgColorHighlight%3Dfffa90%26bgTextureHighlight%3Dflat%26borderColorHighlight%3Ddad55e%26fcHighlight%3D777620%26iconColorHighlight%3D777620%26bgColorError%3Dfddfdf%26bgTextureError%3Dflat%26borderColorError%3Df1a899%26fcError%3D5f3f3f%26iconColorError%3Dcc0000%26bgColorOverlay%3Daaaaaa%26bgTextureOverlay%3Dflat%26bgImgOpacityOverlay%3D0%26opacityOverlay%3D30%26bgColorShadow%3D666666%26bgTextureShadow%3Dflat%26bgImgOpacityShadow%3D0%26opacityShadow%3D30%26thicknessShadow%3D5px%26offsetTopShadow%3D0px%26offsetLeftShadow%3D0px%26cornerRadiusShadow%3D8px&theme-folder-name=base&scope="

jquery-ui: jquery-ui-$(JQUERY_UI_VERSION).custom.zip
	unzip $^
	mv jquery-ui-$(JQUERY_UI_VERSION).custom $@

clean:
	rm -f $(DOWNLOADS)

