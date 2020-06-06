/* Utility functions */
let say = console.log;
let jsay = x => console.log(JSON.stringify(x));

/* Search Engine handling functions */

// Default search engines in Chrome as of 2020-06-06.
// Notice that the Google one is ridiculous.
const default_search_engines = [
	"{google:baseURL}search?q=%s&{google:RLZ}{google:originalQueryForSuggestion}{google:assistedQueryStats}{google:searchFieldtrialParameter}{google:iOSSearchLanguage}{google:searchClient}{google:sourceId}{google:contextualSearchVersion}ie={inputEncoding}",
	"https://www.bing.com/search?q=%s&PC=U316&FORM=CHROMN",
	"https://search.yahoo.com/search{google:pathWildcard}?ei={inputEncoding}&fr=crmas&p=%s",
	"https://duckduckgo.com/?q=%s",
	"https://www.ecosia.org/search?q=%s&addon=opensearch"
];

// Represents a search engine URL query eg. https://www.ecosia.org/search?q=%s
class SearchEngine {
	domain; // eg. www.ecosia.org
	path;   // eg. search
	key;    // eg. q

	constructor (d, p, k) {
		this.domain = d;
		this.path = p;
		this.key = k;
	}

	// Extract the query string from the URL
	// url to match against -> search string or null
	// URL -> USVString|null
	match_on (url) {
		let matches_url = (
			url.hostname === this.domain
			&& url.pathname === '/' + this.path
		);

		if (!matches_url) {
			return null;
		}

		return url.searchParams.get(this.key);
	}

	// String representation
	to_string () {
		return `${this.domain}/${this.path}?${this.key}=%s`
	}
}

// Parse the search engine URI template with regex
// uri template string -> SearchEngine or failure reason
// String -> SearchEngine|String
function parse_uri_into_search_engine (s) {
	let m;

	// Some replacement because damn it, template strings. Taken from here:
	// https://source.chromium.org/chromium/chromium/src/+/master:components/search_engines/template_url.cc;drc=df87046cb8ae4dbd62cda6e56d317016a6fa02c7;l=695
	s = s.replace('{google:pathWildcard}', '');

	// Try to find the domain name
	m = /:\/\/(.*?)\/(.*)/.exec(s);
	if (m === null) { return "domain" }

	let domain = m[1];
	s = m[2];

	// Try to get path
	m = /(.*)\?(.*)/.exec(s);
	if (m === null) { return "path" }

	let path = m[1];
	s = m[2];

	// Try to get key
	m = /(?:^|&)([^&]+)=%s/.exec(s);
	if (m === null) { return "key" }

	let key = m[1];

	return new SearchEngine(domain, path, key)
}

// The search engines we test for
let search_engines = [
	// Special case Google -_-
	new SearchEngine("www.google.com", "search", "q"),
	... default_search_engines
		.map(parse_uri_into_search_engine)
		.filter(x => x instanceof SearchEngine)
];

/* OpenNIC TLD testing */

// OpenNIC TLDs as of 2020-06-06
const opennic_tlds =
	"bbs|chan|cyb|dyn|epic|geek|gopher|indy|libre"
	+ "|neo|null|o|oss|oz|parody|pirate"

// Tests if a string is made of letters and ends with an OpenNIC TLD
let onic_re = new RegExp(`^\\w+\\.(?:${opennic_tlds})$`);
function is_definitely_opennic (s) {
	return onic_re.test(s)
}

/* Info */

say(`Initialized opennic-omnibox with the the following search engines:
${search_engines.map(x => '- ' + x.to_string()).join('\n')}
OpenNIC TLDs are: ${opennic_tlds.split('|').join(', ')}.`);

/* Register webRequest handler */

// Define handler
function opennic_url_redirector (request) {
	let manual_request = (
		request.originUrl === undefined    // Firefox
		&& request.initiator === undefined // Chrome
	);

	// Don't process automatic requests
	if (!manual_request) {
		return { }
	}

	say(`${request.url}`);

	// Get the query string
	let url = new URL(request.url);
	let query;
	for (let se of search_engines) {
		query = se.match_on(url);
		if (query !== null) {
			break;
		}
	}

	// Not a search, abort
	if (query === null) { return {} }

	say(`query: ${query}`);

	let is_opennic = is_definitely_opennic(query);

	// Not an OpenNIC domain
	if (!is_opennic) { return {} }

	say("Redirecting!")

	// webRequest.BlockingResponse
	return { redirectUrl: "http://" + query + "/" }
}

browser.webRequest.onBeforeRequest.addListener(
	opennic_url_redirector,
	/* filters */ { urls: ["*://*/*"] },
	/* extra flags */ ["blocking"]
);
