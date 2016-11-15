#!/usr/bin/perl -T

use CGI;
use Symbol;
use IPC::Open3;
use IO::Select;

use strict vars;

my $JAVA = '/usr/bin/java';
my $RULES_DIR = '.';

my $q = CGI->new;
eval {
  # get CGI params
  my $json = $q->param('json');
  die "Missing 'json' parameter" unless (defined($json));
  my $post = $q->param('post');
  my $filename = undef;
  if (defined($post)) {
    die "Missing or malformed ontology prefix"
      if ($json !~ /"ontologyPrefix": "([\w-]+)(::)?"/);
    $filename = lc($1) . "RuleSet.lisp";
  }
  # get rid of :: after prefix if any
  $json =~ s/("ontologyPrefix": "[\w-]+)::"/$1"/;
  # sanitize environment
  %ENV = (PATH => '/usr/bin:/usr/local/bin');
  # run ExtractionMapper, writing $json on stdin, and reading stderr and stdout
  my ($chld_in, $chld_out, $chld_err) = (gensym, gensym, gensym);
  my $pid = open3($chld_in, $chld_out, $chld_err,
    $JAVA, qw(-cp .:json-simple.jar ExtractionMapper));
  my $s = IO::Select->new();
  $s->add($chld_out);
  $s->add($chld_err);
  print $chld_in $json;
  close($chld_in);
  my $lisp = ''; # stdout
  my $errors = ''; # stderr
  my @ready;
  while (@ready = $s->can_read) {
    for my $h (@ready) {
      my $read_length = 0;
      if ($h == $chld_out) {
	$read_length = sysread($h, $lisp, 512, length($lisp));
      } elsif ($h == $chld_err) {
	$read_length = sysread($h, $errors, 512, length($errors));
      } else {
	die "WTF";
      }
      if ($read_length == 0) {
	$s->remove($h);
	close($h);
      }
    }
  }
  # wait for ExtractionMapper to exit, and check its exit status
  waitpid($pid, 0);
  my $exit_status = $? >> 8;
  die "ExtractionMapper exited with status $exit_status. Error messages:\n$errors"
    if ($exit_status != 0);
  # save lisp to file if requested
  if (defined($filename)) {
    open FH, ">$RULES_DIR/$filename" or die "Can't open output file $filename";
    print FH $lisp;
    close FH;
  }
  # send lisp to client
  print $q->header(
    -type => 'text/plain', # Lisp predates MIME types
    -charset => 'UTF-8'
  ), $lisp;
  1;
# if there were any errors, report them to the client as a server error
} || print $q->header(-status => 500, -type => 'text/plain'), $@;

