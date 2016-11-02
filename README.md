# Ontology Mapper/Builder #

A tool for building an ontology and/or creating mappings between your ontology and the TRIPS ontology.

[Use it online](http://www.cs.rochester.edu/research/trips/lexicon/ontology-mapper/ontology-mapper.html)

[User documentation](http://www.cs.rochester.edu/research/trips/lexicon/ontology-mapper/doc/README.html)

The code in this repository is licensed using the [GPL 2+](http://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html) (see `LICENSE.txt`).

Local installation currently requires the `data/` and `dsl/` subdirectories of `http://www.cs.rochester.edu/research/trips/lexicon/`, but that may soon change to allow the use of a clone of [mrmechko/flaming-tyrion](https://github.com/mrmechko/flaming-tyrion) instead (which renames the files to use `_` instead of `::`). If you plan to install locally, make sure to edit the `INSTALL_DIR` variable in the `Makefile`.
