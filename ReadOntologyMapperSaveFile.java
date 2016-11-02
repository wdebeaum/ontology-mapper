import java.io.InputStreamReader;
import java.io.IOException;
import java.util.Map;
// These are from json-simple: https://github.com/fangyidong/json-simple
// also available in cabot and bob as
// $TRIPS_BASE/src/Conceptualizer/json-simple-1.1.1.jar
import org.json.simple.parser.JSONParser;
import org.json.simple.parser.ParseException;
import org.json.simple.JSONObject;
import org.json.simple.JSONArray;

/** Read a file saved from the Ontology Mapper/Builder in JSON format from
 * stdin, and write the strings from it to stdout in no particular order. This
 * is just a demonstration of how to reference fields in the JSON data
 * structure from Java.
 *
 * Compile:
 * export TRIPS_BASE=/path/to/a/cabot/or/bob/checkout
 * javac \
 *   -cp .:$TRIPS_BASE/src/Conceptualizer/json-simple-1.1.1.jar \
 *   ReadOntologyMapperSaveFile.java
 *
 * Run:
 * java \
 *   -cp .:$TRIPS_BASE/src/Conceptualizer/json-simple-1.1.1.jar \
 *   ReadOntologyMapperSaveFile \
 *   &lt; input.json \
 *   &gt; output.txt
 *
 * (javadoc doesn't like raw less-than and greater-than signs, so they're
 * escaped above)
 */
public class ReadOntologyMapperSaveFile {
  public static void main(String[] args) {
    JSONParser parser = new JSONParser();
    // parse takes a Reader as its argument, so wrap System.in
    InputStreamReader in = new InputStreamReader(System.in);
    try {
      // parse returns Object, but we know it's a JSONObject for this input
      JSONObject concepts = (JSONObject)parser.parse(in);
      // JSONObject is just a special HashMap<String, Object>, except it just
      // uses HashMap without specifying the key type :(
      for (Object entryObject : concepts.entrySet()) {
	Map.Entry entry = (Map.Entry)entryObject;
	String key = (String)entry.getKey();
	// you probably want to ignore this one, since it's the only key that's
	// not a concept name
	if (key.equals("ontologySaveDate")) { continue; }
	System.out.println(key); // your concept name
	if (key.equals("ontologyPrefix")) {
	  String prefix = (String)entry.getValue();
	  System.out.println(prefix);
	  continue;
	}
	JSONObject concept = (JSONObject)entry.getValue();
	// parent is optional; top-level concepts have no parent
	if (concept.containsKey("parent")) {
	  String parent = (String)concept.get("parent");
	  System.out.println(parent);
	}
	JSONArray conceptMappings = (JSONArray)concept.get("mappings");
	for (Object conceptMappingObject : conceptMappings) {
	  JSONObject conceptMapping = (JSONObject)conceptMappingObject;
	  JSONArray tripsConcepts = (JSONArray)conceptMapping.get("concepts");
	  for (Object tripsConceptObject : tripsConcepts) {
	    String tripsConcept = (String)tripsConceptObject;
	    System.out.println(tripsConcept);
	  }
	  JSONArray rolePathMappings = (JSONArray)conceptMapping.get("rolePathMappings");
	  for (Object pathObject : rolePathMappings) {
	    JSONArray path = (JSONArray)pathObject;
	    for (Object stepObject : path) {
	      if (stepObject instanceof JSONObject) {
		JSONObject step = (JSONObject)stepObject;
		String tripsRoleName = (String)step.get("role");
		System.out.println(tripsRoleName);
		// fillerType is optional
		if (step.containsKey("fillerType")) {
		  String fillerType = (String)step.get("fillerType");
		  System.out.println(fillerType);
		}
	      } else {
		String role = (String)stepObject;
		System.out.println(role);
	      }
	    }
	  }
	}
	JSONArray roles = (JSONArray)concept.get("roles");
	for (Object roleObject : roles) {
	  String role = (String)roleObject;
	  System.out.println(role);
	}
	// ignoring keys "comment", "words", "examples", since I'm guessing you're not so interested in those
      }
    } catch (IOException e) {
      System.err.println("Error reading stdin:");
      e.printStackTrace();
    } catch (ParseException e) {
      System.err.println("Error parsing JSON:");
      e.printStackTrace();
    } catch (ClassCastException e) {
      System.err.println("Error interpreting JSON:");
      e.printStackTrace();
    }
  }
}
