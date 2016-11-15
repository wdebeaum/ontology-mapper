# Ontology Mapper/Builder #

A tool for building an ontology and/or creating mappings between your ontology and the TRIPS ontology.

[Use it online](http://trips.ihmc.us/ontology-mapper/ontology-mapper.html)

[User documentation](http://trips.ihmc.us/ontology-mapper/doc/README.html)

The code in this repository is licensed using the [GPL 2+](http://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html) (see `LICENSE.txt`).

Local installation requires a clone of [mrmechko/flaming-tyrion](https://github.com/mrmechko/flaming-tyrion). If you plan to install locally, make sure to edit the variables in the Makefiles, especially `INSTALL_DIR`. `Makefile-backend` is for the CGI program behind the "build rules" button, which we run on a separate server.
